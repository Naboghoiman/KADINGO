/* eslint-disable */
// @ts-check
/// <reference lib="webworker" />

class LinearMemoryBuffer {
    /**@type {number} */pointer;
    /**@type {number} */length;
    /**@type {number} */_type;
    /**@type {SuperpoweredGlue} */_glue;
    /**@type {Int8Array|Int16Array|Int32Array|BigInt64Array|Uint8Array|Uint16Array|Uint32Array|BigUint64Array|Float32Array|Float64Array} */array;
    /**@type {any[]}*/ static _types = [null, Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, BigUint64Array, BigInt64Array, Float32Array, Float64Array];

    constructor(/**@type {number} */pointer, /**@type {number} */length, /**@type {number} */type, /**@type {SuperpoweredGlue}*/glue) {
        this.length = length;
        this._type = type;
        this._glue = glue;
        this.pointer = (pointer == 0) ? glue.malloc(length * LinearMemoryBuffer._types[this._type].BYTES_PER_ELEMENT) : pointer;
        this.update();
        this._glue.addBuffer(this);
    }

    update() {
        const ab = this._glue.linearMemory, t = LinearMemoryBuffer._types[this._type];
        this.array = new t(ab, this.pointer, (this.length < 0) ? Math.floor((ab.byteLength - this.pointer) / t.BYTES_PER_ELEMENT) : this.length);
    }

    free() {
        this._glue.free(this.pointer);
        this._glue.removeBuffer(this);
    }
}

class SuperpoweredGlue {
    static wasmCDNUrl = '/vendor/superpowered/superpowered-npm.wasm';

    /**@type {number}*/id = Math.floor(Math.random() * Date.now());
    /**@type {ArrayBuffer}*/linearMemory;
    /**@type {ArrayBuffer} */wasmCode;
    /**@type {boolean} */logMemory = true;

    /**@type {Map<number,object>}*/_trackLoaderReceivers = new Map();
    /**@type {number}*/_nextTrackLoaderReceiverID = 0;
    /**@type {Map<number,Set<LinearMemoryBuffer>>}*/_buffers = new Map();
    /**@type {object}*/_classUnderConstruction = null;
    /**@type {Map<string,Map<string,Function>>}*/_functionsWithNamespace = new Map();
    /**@type {object}*/_exportsToWASM;
    /**@type {Uint8Array}*/_memoryGrowArray;
    /**@type {number}*/_memoryGrowPointer;
    /**@type {WebAssembly.Instance}*/_wasmInstance;
    /**@type {string|undefined} */_trackLoaderSource = undefined;
    /**@type {Function} */_malloc;
    /**@type {Function} */_free;
    /**@type {Function} */_heapBase;
    /**@type {Function} */_stackSize;
    /**@type {Function} */_lastArrayLength;
    /**@type {Function} */_setInt64;
    /**@type {DataView} */_view;
    /**@type {boolean} */_littleEndian = (new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44);

    /**@type {object}*/ _activeSABPointerLoadPromises = {};
    /**@type {object}*/ _activeSABMemoryAllocationPromises = {};

    /**@typedef {{wasmCDNUrl?: string, sharedArrayBuffer?: boolean}} SuperpoweredGlueConfiguration */

    /**@returns {Promise<SuperpoweredGlue>} */
    static async Instantiate(
        /**@type {string}*/licenseKey, /**@type {string | SuperpoweredGlueConfiguration}*/wasmUrlOrConfigurationObject = SuperpoweredGlue.wasmCDNUrl) {
        let usingSharedArrayBuffer = false;
        if (wasmUrlOrConfigurationObject && Object.prototype.toString.call(wasmUrlOrConfigurationObject) === "[object Object]") {
            const config = /**@type {SuperpoweredGlueConfiguration}*/(wasmUrlOrConfigurationObject);
            if (config.wasmCDNUrl) SuperpoweredGlue.wasmCDNUrl = config.wasmCDNUrl;
            if (config.sharedArrayBuffer) usingSharedArrayBuffer = true;
        } else {
            SuperpoweredGlue.wasmCDNUrl = /**@type {string}*/(wasmUrlOrConfigurationObject);
        }
        const obj = new SuperpoweredGlue();
        const ab = await fetch(SuperpoweredGlue.wasmCDNUrl).then(response => response.arrayBuffer());
        await obj.loadFromArrayBuffer(usingSharedArrayBuffer ? SuperpoweredGlue.getWASMWithSharedArrayBufferEnabled(ab) : ab);
        obj['Initialize'](licenseKey);
        return obj;
    }

    async loadFromArrayBuffer(/**@type {ArrayBuffer}*/wasmCode, /**@type {object}*/afterWASMLoaded = null) {
        this.wasmCode = wasmCode;
        await WebAssembly.instantiate(wasmCode, { wasi_snapshot_preview1: this.wasi, env: this._exportsToWASM }).then((result) => {
            this.setInstance(result.instance);
            if (afterWASMLoaded != null) afterWASMLoaded.afterWASMLoaded();
        });
    }

    async loadFromModule(/**@type {BufferSource}*/module) {
        await WebAssembly.instantiate(module, { wasi_snapshot_preview1: this.wasi, env: this._exportsToWASM }).then((result) => this.setInstance(result.instance));
    }

    async loadFromURL(/**@type {string}*/url, /**@type {boolean}*/storeCode = true) {
        const wasmCode = await fetch(url).then(response => response.arrayBuffer());
        if (storeCode) this.wasmCode = wasmCode;
        await WebAssembly.instantiate(wasmCode, { wasi_snapshot_preview1: this.wasi, env: this._exportsToWASM }).then((result) => this.setInstance(result.instance));
    }

    /**@returns {ArrayBuffer} */
    static getWASMWithSharedArrayBufferEnabled(/**@type {ArrayBuffer} */wasm) {
        const v = new DataView(wasm), to = wasm.byteLength, result = new Uint8Array(wasm.byteLength);
        result.set(new Uint8Array(wasm));
        let pos = 8, sectionSize, shift;
        while (pos < to) {
            const sectionType = v.getUint8(pos++);

            sectionSize = shift = 0;
            while (pos < to) {
                const byte = v.getUint8(pos++);
                sectionSize |= (byte & 127) << shift;
                if ((byte & 128) == 0) break; else shift += 7;
            }

            if (sectionType == 5) {
                result[pos + 1] = 3;
                break;
            } else pos += sectionSize;
        }
        return result.buffer;
    }

    constructor() {
        const glue = this;
        this.Uint8Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 1, glue); } }
        this.Int8Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 2, glue); } }
        this.Uint16Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 3, glue); } }
        this.Int16Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 4, glue); } }
        this.Uint32Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 5, glue); } }
        this.Int32Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 6, glue); } }
        this.BigUint64Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 7, glue); } }
        this.BigInt64Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 8, glue); } }
        this.Float32Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 9, glue); } }
        this.Float64Buffer = class { constructor(/**@type {number}*/length) { return new LinearMemoryBuffer(0, length, 10, glue); } }
        this._exportsToWASM = {
            consolelog: (/**@type {number}*/pointer, /**@type {number}*/strlen) => console.log(this.toString(pointer, strlen)),
            emscripten_notify_memory_growth: this._onMemoryGrowth.bind(this),
            __createClass__: this._createClass.bind(this),
            __createStaticProperty__: this._createStaticProperty.bind(this),
            __createStaticMethod__: this._createStaticMethod.bind(this),
            __createConstructor__: () => { },
            __createDestructor__: () => { },
            __createProperty__: this._createProperty.bind(this),
            __createMethod__: this._createMethod.bind(this),
            __createFunction__: this._createFunction.bind(this),
            __createClassConstant__: (/**@type {number}*/nameptr, /**@type {number}*/namelen, /**@type {number}*/value) => this._classUnderConstruction[this.toString(nameptr, namelen)] = value,
            __createConstant__: (/**@type {number}*/nameptr, /**@type {number}*/namelen, /**@type {number}*/value) => this[this.toString(nameptr, namelen)] = value,
            __runjs__: (/**@type {number}*/pointer) => { return eval(this.toString(pointer)); },
            abs: Math.abs,
            round: Math.round,
            roundf: Math.fround,
            abort: () => console.log('abort')
        };
        this.wasi = { proc_exit: () => console.log('abort') };
    }

    setInstance(/**@type {WebAssembly.Instance}*/wasmInstance) {
        this._wasmInstance = wasmInstance;
        /**@type {Function}*/(this._wasmInstance.exports._initialize)();

        this._lastArrayLength = /**@type {Function}*/(this._wasmInstance.exports.__lastarraylength__);
        this._malloc = /**@type {Function}*/(this._wasmInstance.exports.__malloc__);
        this._stackSize = /**@type {Function}*/(this._wasmInstance.exports.__stacksize__);
        this._heapBase = /**@type {Function}*/(this._wasmInstance.exports.__heapbase__);
        this._free = /**@type {Function}*/(this._wasmInstance.exports.__free__);
        this._setInt64 = /**@type {Function}*/(this._wasmInstance.exports.__setint64__);

        this.linearMemory = this._wasmInstance.exports.memory['buffer'];
        this._view = new DataView(this.linearMemory);
        this._memoryGrowPointer = this._malloc(16);
        this._memoryGrowArray = new Uint8Array(this.linearMemory, this._memoryGrowPointer, 16);

        const outputBuffer = this._malloc(1024), stringview = new Uint8Array(this.linearMemory, this._malloc(1024), 1024), demangle = /**@type {Function}*/(this._wasmInstance.exports.__demangle__);
        for (const name in this._wasmInstance.exports) if (name != '__demangle__') {
            const length = demangle(this.toWASMString(name, stringview), outputBuffer), func = /**@type {Function}*/(this._wasmInstance.exports[name]);
            if (length > 0) {
                let demangledName = this.toString(outputBuffer, length);
                const par = demangledName.indexOf('(');
                if (par > 0) demangledName = demangledName.substring(0, par);

                let namespace = demangledName.lastIndexOf('::');
                if (namespace > 0) {
                    namespace = demangledName.lastIndexOf('::', namespace - 1);
                    if (namespace > 0) demangledName = demangledName.substr(namespace + 2);
                }

                // class members have namespaces removed from this point, but functions not
                const split = demangledName.split('::', 2);
                if (split.length == 2) {
                    let map = this._functionsWithNamespace.get(split[0]);
                    if (!map) {
                        map = new Map();
                        this._functionsWithNamespace.set(split[0], map);
                    }
                    map.set(split[1], func);
                }
                this[demangledName] = func;
            } else this[name] = func;
        }
        this._free(outputBuffer);
        this._free(stringview.byteOffset);

        /**@type {Function}*/(this._wasmInstance.exports.__initialize__)();
        for (const [name, map] of this._functionsWithNamespace) map.clear();
        this._functionsWithNamespace.clear();
        this._logMemory();
        this._classUnderConstruction = null;
    }

    /**@returns {LinearMemoryBuffer|number|undefined} */
    returnPointerToView(/**@type {number|undefined}*/pointer, /**@type {number}*/type) {
        if ((type < 1) || (pointer == undefined)) return pointer;
        const length = this._lastArrayLength();
        return new LinearMemoryBuffer(pointer, length > 0 ? length : -1, type, this);
    }

    /**@returns {LinearMemoryBuffer|number|undefined} */
    _invokeFunction(/**@type {number}*/pointerToInstance, /**@type {Function} */func, /**@type {number} */returnPointerType) {
        if ((arguments.length == 4) && (typeof arguments[3] == 'object')) {
            const obj = arguments[3]; let n = 0;
            for (const m in obj) arguments[n++] = obj[m];
            arguments.length = n;
        }

        const strings = [], args = [], to = arguments.length;
        if (pointerToInstance != 0) args.push(pointerToInstance);
        for (let index = 3; index < to; index++) {
            if (arguments[index].array != undefined) args.push(arguments[index].array.byteOffset);
            else if (arguments[index].pointerToInstance != undefined) args.push(arguments[index].pointerToInstance);
            else if (typeof arguments[index] == 'string') {
                const str = this.toWASMString(arguments[index]);
                args.push(str);
                strings.push(str);
            } else args.push(arguments[index]);
        }

        const r = func.apply(func, args);
        for (const string of strings) this.free(string);
        return this.returnPointerToView(r, returnPointerType);
    }

    _createClass(/**@type {number}*/classnamePointer, /**@type {number}*/classnameLen, /**@type {number}*/sizeofClass) {
        const classname = this.toString(classnamePointer, classnameLen), glue = this, O = class {
            /**@type {string} */className = classname;
            /**@type {number} */pointerToInstance;

            constructor() {
                const constructorFunction = glue[classname + '::' + classname], args = [].slice.call(arguments);
                if (constructorFunction == undefined) throw classname + ' has no constructor'; else args.unshift(glue.malloc(sizeofClass));
                this.pointerToInstance = constructorFunction.apply(null, args);
                const meta = Object.getPrototypeOf(this).constructor.classInfo;
                for (const property of meta.properties) glue.createPropertyFromDescriptor(this, property);
                for (const method of meta.methods) this[method.name] = glue._invokeFunction.bind(glue, this.pointerToInstance, method.function, method.returnPointerType);
            }

            destruct() {
                glue[classname + '::~' + classname]?.(this.pointerToInstance);
                glue.free(this.pointerToInstance);
                Object.getOwnPropertyNames(this).forEach((property) => delete this[property]);
                Object.setPrototypeOf(this, null);
            }
        }
        O.classInfo = { name: classname, properties: [], methods: [] }
        this._classUnderConstruction = this[classname] = O;
        this._functionsWithNamespace.delete(classname);
    }

    /**@returns {number|bigint|undefined} */
    _read(/**@type {number} */pointer, /**@type {number} */type) {
        switch (type) {
            case 1: return this._view.getUint8(pointer);
            case 2: return this._view.getInt8(pointer);
            case 3: return this._view.getUint16(pointer, this._littleEndian);
            case 4: return this._view.getInt16(pointer, this._littleEndian);
            case 5: return this._view.getUint32(pointer, this._littleEndian);
            case 6: return this._view.getInt32(pointer, this._littleEndian);
            case 7: return this._view.getBigUint64(pointer, this._littleEndian);
            case 8: return this._view.getBigInt64(pointer, this._littleEndian);
            case 9: return this._view.getFloat32(pointer, this._littleEndian);
            case 10: return this._view.getFloat64(pointer, this._littleEndian);
        }
        return undefined;
    }

    _write(/**@type {number} */pointer, /**@type {number} */type, /**@type {number|bigint} */value) {
        switch (type) {
            case 1: this._view.setUint8(pointer, /**@type {number}*/(value)); break;
            case 2: this._view.setInt8(pointer, /**@type {number}*/(value)); break;
            case 3: this._view.setUint16(pointer, /**@type {number}*/(value), this._littleEndian); break;
            case 4: this._view.setInt16(pointer, /**@type {number}*/(value), this._littleEndian); break;
            case 5: this._view.setUint32(pointer, /**@type {number}*/(value), this._littleEndian); break;
            case 6: this._view.setInt32(pointer, /**@type {number}*/(value), this._littleEndian); break;
            case 7: this._view.setBigUint64(pointer, /**@type {bigint}*/(value), this._littleEndian); break;
            case 8: this._view.setBigInt64(pointer, /**@type {bigint}*/(value), this._littleEndian); break;
            case 9: this._view.setFloat32(pointer, /**@type {number}*/(value), this._littleEndian); break;
            case 10: this._view.setFloat64(pointer, /**@type {number}*/(value), this._littleEndian); break;
        }
    }

    _createProperty(/**@type {number}*/propertynamePointer, /**@type {number}*/propertynameLen, /**@type {number}*/offset, /**@type {number}*/viewType, /**@type {number}*/viewLength) {
        this._classUnderConstruction.classInfo.properties.push({ name: this.toString(propertynamePointer, propertynameLen), offset: offset, viewType: viewType, viewLength: viewLength });
    }

    createPropertyFromDescriptor(/**@type {object}*/object, /**@type {object}*/descriptor) {
        const basePointer = object?.pointerToInstance ?? 0;
        if (descriptor.viewLength > 1) {
            const buffer = new LinearMemoryBuffer(basePointer + descriptor.offset, descriptor.viewLength, descriptor.viewType, this);
            Object.defineProperty(object, descriptor.name, {
                get: function () { return buffer.array; },
                configurable: true,
                enumerable: true
            });
        } else Object.defineProperty(object, descriptor.name, {
            get: () => { return this._read(basePointer + descriptor.offset, descriptor.viewType); },
            set: (value) => { this._write(basePointer + descriptor.offset, descriptor.viewType, value); },
            configurable: true,
            enumerable: true
        });
    }

    _createStaticProperty(/**@type {number}*/propertynamePointer, /**@type {number}*/propertynameLen, /**@type {number}*/pointer, /**@type {number}*/viewType, /**@type {number}*/viewLength) {
        this.createPropertyFromDescriptor(this._classUnderConstruction, { name: this.toString(propertynamePointer, propertynameLen), offset: pointer, viewType: viewType, viewLength: viewLength });
    }

    _createMethod(/**@type {number}*/methodnamePointer, /**@type {number}*/methodnameLen, /**@type {number}*/returnPointerType) {
        const methodname = this.toString(methodnamePointer, methodnameLen);
        this._classUnderConstruction.classInfo.methods.push({ name: methodname, function: this[this._classUnderConstruction.classInfo.name + '::' + methodname], returnPointerType: returnPointerType });
    }

    _createStaticMethod(/**@type {number}*/methodnamePointer, /**@type {number}*/methodnameLen, /**@type {number}*/returnPointerType) {
        const methodname = this.toString(methodnamePointer, methodnameLen), wasmMethodname = this._classUnderConstruction.classInfo.name + '::' + methodname;
        this._classUnderConstruction[methodname] = this._invokeFunction.bind(this, 0, this[wasmMethodname], returnPointerType);
    }

    _createFunction(/**@type {number}*/methodnamePointer, /**@type {number}*/methodnameLen, /**@type {number}*/returnPointerType) {
        const methodname = this.toString(methodnamePointer, methodnameLen);
        if (!this[methodname]) { // maybe this function is in a namespace
            for (const [namespace, map] of this._functionsWithNamespace) {
                const method = map.get(methodname);
                if (method != undefined) {
                    this[methodname] = method;
                    map.delete(methodname);
                    break;
                }
            }
            if (!this[methodname]) return;
        }
        this[methodname] = this._invokeFunction.bind(this, 0, this[methodname], returnPointerType);
    }

    exportToWasm(/**@type {string}*/functionName, /**@type {Function}*/f) {
        this._exportsToWASM[functionName] = () => {
            const r = f.apply(f, arguments);
            return (r.array != undefined) ? r.array.byteOffset : r;
        }
    }

    _onMemoryGrowth(/**@type {number}*/n) {
        this.linearMemory = this._wasmInstance.exports.memory['buffer'];
        this._view = new DataView(this.linearMemory);
        if (this._memoryGrowArray.buffer.byteLength < 1) this._updateMemoryViews();
        this._logMemory();
    }

    toString(/**@type {number}*/pointer, /**@type {number}*/strlen = 0) {
        let view = null;
        if (strlen < 1) {
            const viewLength = Math.min(16384, this.linearMemory.byteLength - pointer);
            view = new Uint8Array(this.linearMemory, pointer, viewLength);
            for (strlen = 0; strlen < viewLength; strlen++) if (view[strlen] == 0) break;
        } else view = new Uint8Array(this.linearMemory, pointer, strlen);

        let str = '', i = 0, bytesNeeded, codePoint, octet;
        while (i < strlen) {
            octet = view[i];

            if (octet <= 0x7f) {
                bytesNeeded = 0;
                codePoint = octet & 0xff;
            } else if (octet <= 0xdf) {
                bytesNeeded = 1;
                codePoint = octet & 0x1f;
            } else if (octet <= 0xef) {
                bytesNeeded = 2;
                codePoint = octet & 0x0f;
            } else if (octet <= 0xf4) {
                bytesNeeded = 3;
                codePoint = octet & 0x07;
            } else bytesNeeded = codePoint = 0;

            if (strlen - i - bytesNeeded > 0) {
                for (let k = 0; k < bytesNeeded; k++) codePoint = (codePoint << 6) | (view[i + k + 1] & 0x3f);
            } else {
                codePoint = 0xfffd;
                bytesNeeded = strlen - i;
            }

            str += String.fromCodePoint(codePoint);
            i += bytesNeeded + 1;
        }
        return str;
    }

    toWASMString(/**@type {string} */str, /**@type {Uint8Array|undefined}*/view) {
        const length = str.length, maxBytes = length * 4 + 1;
        let i = 0, c, bits, destination = 0, codePoint;
        if (view == undefined) view = new Uint8Array(this.linearMemory, this.malloc(maxBytes), maxBytes);
        while (i < length) {
            codePoint = str.codePointAt(i) ?? 0;

            if (codePoint <= 0x0000007f) {
                c = 0;
                bits = 0x00;
            } else if (codePoint <= 0x000007ff) {
                c = 6;
                bits = 0xc0;
            } else if (codePoint <= 0x0000ffff) {
                c = 12;
                bits = 0xe0;
            } else if (codePoint <= 0x001fffff) {
                c = 18;
                bits = 0xf0;
            } else c = bits = 0;

            view[destination++] = bits | (codePoint >> c);
            c -= 6;
            while (c >= 0) {
                view[destination++] = 0x80 | ((codePoint >> c) & 0x3f);
                c -= 6;
            }
            i += (codePoint >= 0x10000) ? 2 : 1;
        }

        view[destination] = 0;
        return view.byteOffset;
    }

    /**@returns {string} */
    _niceSize(/**@type {number}*/bytes) {
        if (bytes == 0) return '0 byte'; else if (bytes == 1) return '1 byte';
        const postfix = [' bytes', ' kb', ' mb', ' gb', ' tb'], n = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, n)) + postfix[n];
    }

    _logMemory() {
        if (this.logMemory) console.log('WASM ' + (Object.prototype.toString.call(this.linearMemory) === '[object ArrayBuffer]' ? 'memory' : 'shared memory') + ': ' + this._niceSize(this._stackSize()) + ' stack, ' + this._niceSize(this.linearMemory.byteLength - this._heapBase()) + ' heap, ' + this._niceSize(this.linearMemory.byteLength) + ' total.');
    }

    malloc(/**@type {number}*/bytes) {
        const pointer = this._malloc(bytes);
        if (this._memoryGrowArray.buffer.byteLength < 1) this._updateMemoryViews();
        return pointer;
    }

    _updateMemoryViews() {
        for (const [pointer, set] of this._buffers) for (const buffer of set) buffer.update();
        this._memoryGrowArray = new Uint8Array(this.linearMemory, this._memoryGrowPointer, 16);
    }

    addBuffer(/**@type {LinearMemoryBuffer} */buffer) {
        const existing = this._buffers.get(buffer.pointer);
        if (existing) existing.add(buffer); else this._buffers.set(buffer.pointer, new Set([buffer]));
    }

    removeBuffer(/**@type {LinearMemoryBuffer} */buffer) {
        const set = this._buffers.get(buffer.pointer);
        if (!set) return; else set.delete(buffer);
        if (set.size < 1) this._buffers.delete(buffer.pointer);
    }

    free(/**@type {number}*/pointer) {
        const set = this._buffers.get(pointer);
        if (set) {
            set.clear();
            this._buffers.delete(pointer);
        }
        this._free(pointer);
    }

    setInt64(/**@type {number}*/pointer, /**@type {number}*/index, /**@type {number}*/value) {
        this._setInt64(pointer, index, value);
    }

    bufferToWASM(/**@type {any}*/buffer, /**@type {any}*/input, /**@type {number}*/index) {
        let inBufferL = null, inBufferR = null;
        if (index === undefined) index = 0;
        if (typeof input.getChannelData === 'function') {
            inBufferL = input.getChannelData(0);
            inBufferR = input.getChannelData(1);
        } else {
            inBufferL = input[index][0];
            inBufferR = input[index][1];
        }
        const arr = (buffer.constructor === Array) ? buffer[index].array : buffer.array, to = arr.length;
        for (let n = 0, i = 0; n < to; n++, i++) {
            arr[n++] = inBufferL[i];
            arr[n] = inBufferR[i];
        }
    }

    bufferToJS(/**@type {any}*/buffer, /**@type {any}*/output, /**@type {number}*/index) {
        let outBufferL = null, outBufferR = null;
        if (index === undefined) index = 0;
        if (typeof output.getChannelData === 'function') {
            outBufferL = output.getChannelData(0);
            outBufferR = output.getChannelData(1);
        } else {
            outBufferL = output[index][0];
            outBufferR = output[index][1];
        }
        const arr = (buffer.constructor === Array) ? buffer[index].array : buffer.array, to = arr.length;
        for (let n = 0, i = 0; n < to; n++, i++) {
            outBufferL[i] = arr[n++];
            outBufferR[i] = arr[n];
        }
    }

    arrayBufferToWASM(/**@type {ArrayBuffer}*/arrayBuffer, /**@type {number}*/offset = 0) {
        const pointer = this.malloc(arrayBuffer.byteLength + offset);
        new Uint8Array(this.linearMemory).set(new Uint8Array(arrayBuffer, 0, arrayBuffer.byteLength), pointer + offset);
        return pointer;
    }

    copyWASMToArrayBuffer(/**@type {number}*/pointer, /**@type {number}*/lengthBytes) {
        const arrayBuffer = new ArrayBuffer(lengthBytes);
        new Uint8Array(arrayBuffer, 0, lengthBytes).set(new Uint8Array(this.linearMemory, pointer, lengthBytes));
        return arrayBuffer;
    }

    moveWASMToArrayBuffer(/**@type {number}*/pointer, /**@type {number}*/lengthBytes) {
        const arrayBuffer = this.copyWASMToArrayBuffer(pointer, lengthBytes);
        this.free(pointer);
        return arrayBuffer;
    }

    downloadAndDecode(/**@type {string}*/url, /**@type {object}*/obj) {}
}

class SuperpoweredWebAudio {
    /**@type {object} */Superpowered;
    /**@type {AudioContext} */audioContext;

    constructor(/**@type {number}*/minimumSamplerate, /**@type {object}*/superpowered, /**@type {AudioContext}*/audioContext) {
        this.Superpowered = superpowered;
        this.audioContext = audioContext ?? new AudioContext();
    }

    async createAudioNodeAsync(/**@type {string}*/url, /**@type {string}*/className, /**@type {Function}*/onMessageFromAudioScope, /**@type {number}*/numInputs = 1, /**@type {number}*/numOutputs = 1) {
        return new Promise((resolve, reject) => {
            try {
                this.audioContext.audioWorklet.addModule(url).then(() => {
                    const node = new AudioWorkletNode(this.audioContext, className, {
                        numberOfInputs: numInputs,
                        numberOfOutputs: numOutputs,
                        outputChannelCount: Array(numOutputs).fill(2)
                    });
                    node['sendMessageToAudioScope'] = (message) => node.port.postMessage(message);
                    node.port.onmessage = (event) => onMessageFromAudioScope(event.data);
                    resolve(node);
                }).catch(reject);
            } catch(e) {
                reject(e);
            }
        });
    }
}

if (typeof AudioWorkletProcessor === 'function') {
    class SuperpoweredAudioWorkletProcessor extends AudioWorkletProcessor {
        constructor(options) {
            super();
            this.samplerate = sampleRate;
            this.Superpowered = {
                Float32Buffer: class { constructor(len) { this.array = new Float32Array(len); this.pointer = 0; } free() {} },
                linearMemory: new ArrayBuffer(1024),
                removeBuffer: () => {}
            };
        }
        sendMessageToMainScope(message) { this.port.postMessage(message); }
    }
    SuperpoweredWebAudio.AudioWorkletProcessor = SuperpoweredAudioWorkletProcessor;
}

export { SuperpoweredGlue, SuperpoweredWebAudio };
