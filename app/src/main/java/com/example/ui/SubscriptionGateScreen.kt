package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.security.EntitlementManager

@Composable
fun SubscriptionGateScreen(
    lockReason: String,
    deviceId: String,
    onSubscribe: () -> Unit,
    onRestore: () -> Unit,
    onTransfer: () -> Unit,
    onReviewerCodeSubmitted: (String) -> Boolean,
    modifier: Modifier = Modifier
) {
    var showReviewerDialog by remember { mutableStateOf(false) }
    var reviewerCodeInput by remember { mutableStateOf("") }
    var reviewerError by remember { mutableStateOf(false) }
    var showDeviceDialog by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF0D1117),
                        Color(0xFF050607),
                        Color(0xFF030405)
                    )
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 36.dp)
                .widthIn(max = 540.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Lock Icon with glowing neon accent
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(CircleShape)
                    .background(Color(0xFF151D28))
                    .border(2.dp, Color(0xFF00D2EF), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = "Subscription Lock",
                    tint = Color(0xFFFFC52F),
                    modifier = Modifier.size(38.dp)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "DJ IMAN",
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 4.sp,
                color = Color.White,
                fontFamily = FontFamily.SansSerif,
                modifier = Modifier.testTag("lock_title")
            )

            Text(
                text = "PROFESSIONAL DJ SYSTEM",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 3.sp,
                color = Color(0xFF00D2EF)
            )

            Spacer(modifier = Modifier.height(10.dp))

            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Color(0x33FFC52F),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0x88FFC52F))
            ) {
                Text(
                    text = "SUBSCRIPTION REQUIRED",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 2.sp,
                    color = Color(0xFFFFC52F),
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                )
            }

            Spacer(modifier = Modifier.height(18.dp))

            Text(
                text = lockReason,
                fontSize = 15.sp,
                color = Color(0xFFCBD5E1),
                textAlign = TextAlign.Center,
                lineHeight = 22.sp,
                modifier = Modifier.padding(horizontal = 12.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Pro Features Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF101622)),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF222F44)),
                shape = RoundedCornerShape(14.dp)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "COMPLETE SYSTEM ACCESS INCLUDES:",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.5.sp,
                        color = Color(0xFF00D2EF)
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    FeatureRow("High-Precision Sub-Band Beatgrid Synchronization")
                    FeatureRow("Dual Decks, Slip/DNA Auto-Scratch & Vinyl Platters")
                    FeatureRow("Master Rack DSP: 31-Band EQ & Peak Limiter Guard")
                    FeatureRow("8-Pad Groove Sampler & Real-Time Looper")
                    FeatureRow("Speaker Simulator: 3-Way Cabs, DI & Mic Color")
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Subscribe Button
            Button(
                onClick = onSubscribe,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .testTag("subscribe_button"),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF00D2EF),
                    contentColor = Color(0xFF080D14)
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Star,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "SUBSCRIBE · $9.99 / MONTH",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.sp
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Restore Purchases & Transfer Device
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onRestore,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("restore_button"),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF334155))
                ) {
                    Icon(
                        imageVector = Icons.Default.Restore,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = Color(0xFF94A3B8)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "RESTORE",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                OutlinedButton(
                    onClick = onTransfer,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("transfer_button"),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF334155))
                ) {
                    Icon(
                        imageVector = Icons.Default.Devices,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = Color(0xFF94A3B8)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "TRANSFER",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Reviewer & Device Info Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(
                    onClick = { showReviewerDialog = true },
                    modifier = Modifier.testTag("reviewer_access_button")
                ) {
                    Icon(
                        imageVector = Icons.Default.VpnKey,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = Color(0xFFFFC52F)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Reviewer Access",
                        fontSize = 12.sp,
                        color = Color(0xFFFFC52F)
                    )
                }

                TextButton(onClick = { showDeviceDialog = true }) {
                    Text(
                        text = "Device ID: ${deviceId.take(8)}...",
                        fontSize = 11.sp,
                        color = Color(0xFF64748B)
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "1 subscription = 1 authorized device. All purchases handled securely via Google Play.\nPrivacy Policy · Terms of Service · DJ IMAN Support",
                fontSize = 10.sp,
                color = Color(0xFF475569),
                textAlign = TextAlign.Center,
                lineHeight = 15.sp
            )
        }
    }

    // Reviewer Code Dialog
    if (showReviewerDialog) {
        AlertDialog(
            onDismissRequest = {
                showReviewerDialog = false
                reviewerError = false
            },
            containerColor = Color(0xFF141A24),
            title = {
                Text(
                    text = "Play Console Reviewer Access",
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            },
            text = {
                Column {
                    Text(
                        text = "Enter the confidential review credential provided in Google Play Console App Access to unlock all features without consuming a device slot.",
                        fontSize = 13.sp,
                        color = Color(0xFF94A3B8)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = reviewerCodeInput,
                        onValueChange = {
                            reviewerCodeInput = it
                            reviewerError = false
                        },
                        placeholder = { Text("Enter code (e.g. DJIMAN-PLAY-REVIEW-2026)", fontSize = 12.sp) },
                        isError = reviewerError,
                        modifier = Modifier.fillMaxWidth().testTag("reviewer_code_input"),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White,
                            cursorColor = Color(0xFF00D2EF),
                            focusedBorderColor = Color(0xFF00D2EF)
                        )
                    )
                    if (reviewerError) {
                        Text(
                            text = "Invalid reviewer credential",
                            color = Color(0xFFFF5252),
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val success = onReviewerCodeSubmitted(reviewerCodeInput)
                        if (success) {
                            showReviewerDialog = false
                        } else {
                            reviewerError = true
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF00D2EF), contentColor = Color.Black),
                    modifier = Modifier.testTag("submit_reviewer_code")
                ) {
                    Text("Unlock")
                }
            },
            dismissButton = {
                TextButton(onClick = { showReviewerDialog = false }) {
                    Text("Cancel", color = Color(0xFF94A3B8))
                }
            }
        )
    }

    // Device Info Dialog
    if (showDeviceDialog) {
        AlertDialog(
            onDismissRequest = { showDeviceDialog = false },
            containerColor = Color(0xFF141A24),
            title = {
                Text(text = "Device Authorization Details", fontWeight = FontWeight.Bold, color = Color.White)
            },
            text = {
                Column {
                    Text(text = "Hardware Key Identity:", fontSize = 12.sp, color = Color(0xFF00D2EF))
                    Text(text = deviceId, fontSize = 13.sp, fontFamily = FontFamily.Monospace, color = Color.White)
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = "DJ IMAN uses a cryptographic KeyStore keypair on this unit to guarantee that 1 active subscription is locked to 1 physical device at a time, preventing unauthorized license sharing.",
                        fontSize = 12.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showDeviceDialog = false }) {
                    Text("OK", color = Color(0xFF00D2EF))
                }
            }
        )
    }
}

@Composable
private fun FeatureRow(text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.CheckCircle,
            contentDescription = null,
            tint = Color(0xFF10B981),
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = text,
            fontSize = 12.sp,
            color = Color(0xFFE2E8F0)
        )
    }
}
