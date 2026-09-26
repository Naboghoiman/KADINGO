package com.example.security

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.nio.charset.StandardCharsets
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.util.UUID

sealed class EntitlementState {
    object Loading : EntitlementState()
    data class TrialActive(val remainingMillis: Long, val expiresAt: Long) : EntitlementState()
    data class Subscribed(val deviceId: String, val expiresAt: Long) : EntitlementState()
    object ReviewerActive : EntitlementState()
    data class Locked(val reason: String) : EntitlementState()
}

class EntitlementManager(private val context: Context) {

    companion object {
        private const val PREFS_NAME = "dj_iman_secure_entitlement"
        private const val KEY_TRIAL_STARTED = "trial_started_at"
        private const val KEY_TRIAL_EXPIRES = "trial_expires_at"
        private const val KEY_TRIAL_USED = "trial_used"
        private const val KEY_DEVICE_ID = "device_persistent_id"
        private const val KEY_SUB_ACTIVE = "sub_active"
        private const val KEY_SUB_DEVICE = "sub_authorized_device"
        private const val KEY_SUB_TOKEN = "sub_purchase_token"
        private const val KEY_SUB_EXPIRES = "sub_expires_at"
        private const val KEY_REVIEWER_PASS = "reviewer_pass_active"
        private const val KEYSTORE_ALIAS = "DJ_IMAN_DEVICE_KEY"
        const val REVIEWER_SECRET_CODE = "DJIMAN-PLAY-REVIEW-2026"
        const val TRIAL_DURATION_MS = 24L * 60L * 60L * 1000L // exactly 24 hours
    }

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val _state = MutableStateFlow<EntitlementState>(EntitlementState.Loading)
    val state: StateFlow<EntitlementState> = _state.asStateFlow()

    val deviceId: String by lazy {
        getOrCreateDeviceId()
    }

    init {
        ensureKeyStoreKey()
        evaluateEntitlement()
    }

    private fun ensureKeyStoreKey() {
        try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
                val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
                val spec = KeyGenParameterSpec.Builder(
                    KEYSTORE_ALIAS,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                )
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build()
                kpg.initialize(spec)
                kpg.generateKeyPair()
            }
        } catch (_: Exception) {}
    }

    private fun getOrCreateDeviceId(): String {
        var id = prefs.getString(KEY_DEVICE_ID, null)
        if (id == null) {
            val raw = UUID.randomUUID().toString() + "-" + Build.FINGERPRINT
            val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(StandardCharsets.UTF_8))
            id = "DEV-" + Base64.encodeToString(digest, Base64.NO_WRAP or Base64.URL_SAFE).take(16).uppercase()
            prefs.edit().putString(KEY_DEVICE_ID, id).apply()
        }
        return id
    }

    fun evaluateEntitlement() {
        // 1. Check Reviewer Access
        if (prefs.getBoolean(KEY_REVIEWER_PASS, false)) {
            _state.value = EntitlementState.ReviewerActive
            return
        }

        // 2. Check Subscription & One-Device Authorization
        val isSubActive = prefs.getBoolean(KEY_SUB_ACTIVE, false)
        val subDevice = prefs.getString(KEY_SUB_DEVICE, null)
        val subExpires = prefs.getLong(KEY_SUB_EXPIRES, 0L)
        val now = System.currentTimeMillis()

        if (isSubActive && subExpires > now) {
            if (subDevice == deviceId) {
                _state.value = EntitlementState.Subscribed(deviceId, subExpires)
                return
            } else {
                _state.value = EntitlementState.Locked("Subscription is locked to device: $subDevice. Tap 'Transfer Device' to authorize this unit.")
                return
            }
        }

        // 3. Check 24-Hour Free Trial
        var trialStarted = prefs.getLong(KEY_TRIAL_STARTED, 0L)
        if (trialStarted == 0L) {
            // First legitimate activation on this physical device
            trialStarted = now
            val trialExpires = now + TRIAL_DURATION_MS
            prefs.edit()
                .putLong(KEY_TRIAL_STARTED, trialStarted)
                .putLong(KEY_TRIAL_EXPIRES, trialExpires)
                .putBoolean(KEY_TRIAL_USED, true)
                .apply()
            _state.value = EntitlementState.TrialActive(TRIAL_DURATION_MS, trialExpires)
            return
        }

        val trialExpires = prefs.getLong(KEY_TRIAL_EXPIRES, trialStarted + TRIAL_DURATION_MS)
        val remaining = trialExpires - now

        if (remaining > 0L) {
            _state.value = EntitlementState.TrialActive(remaining, trialExpires)
        } else {
            _state.value = EntitlementState.Locked("Your 24-hour free trial has ended. Subscribe to unlock the complete DJ setup.")
        }
    }

    fun activateReviewerCode(code: String): Boolean {
        if (code.trim().equals(REVIEWER_SECRET_CODE, ignoreCase = true)) {
            prefs.edit().putBoolean(KEY_REVIEWER_PASS, true).apply()
            evaluateEntitlement()
            return true
        }
        return false
    }

    fun purchaseSubscription(purchaseToken: String = UUID.randomUUID().toString()) {
        val expiry = System.currentTimeMillis() + (30L * 24L * 60L * 60L * 1000L) // 30 days
        prefs.edit()
            .putBoolean(KEY_SUB_ACTIVE, true)
            .putString(KEY_SUB_DEVICE, deviceId)
            .putString(KEY_SUB_TOKEN, purchaseToken)
            .putLong(KEY_SUB_EXPIRES, expiry)
            .apply()
        evaluateEntitlement()
    }

    fun transferDevice(toDeviceId: String = deviceId): Boolean {
        val isSubActive = prefs.getBoolean(KEY_SUB_ACTIVE, false)
        val subExpires = prefs.getLong(KEY_SUB_EXPIRES, 0L)
        if (isSubActive && subExpires > System.currentTimeMillis()) {
            prefs.edit()
                .putString(KEY_SUB_DEVICE, toDeviceId)
                .apply()
            evaluateEntitlement()
            return true
        }
        return false
    }

    fun restorePurchases(): Boolean {
        evaluateEntitlement()
        return _state.value is EntitlementState.Subscribed
    }

    fun resetTrialForTesting() {
        val now = System.currentTimeMillis()
        val trialExpires = now + TRIAL_DURATION_MS
        prefs.edit()
            .putLong(KEY_TRIAL_STARTED, now)
            .putLong(KEY_TRIAL_EXPIRES, trialExpires)
            .remove(KEY_SUB_ACTIVE)
            .remove(KEY_REVIEWER_PASS)
            .apply()
        evaluateEntitlement()
    }

    fun lockForTesting() {
        prefs.edit()
            .putLong(KEY_TRIAL_STARTED, 1L)
            .putLong(KEY_TRIAL_EXPIRES, 2L)
            .putBoolean(KEY_SUB_ACTIVE, false)
            .putBoolean(KEY_REVIEWER_PASS, false)
            .apply()
        evaluateEntitlement()
    }
}
