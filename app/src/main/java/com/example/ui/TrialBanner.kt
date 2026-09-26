package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.security.EntitlementState

@Composable
fun TrialBanner(
    state: EntitlementState,
    onManageClicked: () -> Unit,
    modifier: Modifier = Modifier
) {
    when (state) {
        is EntitlementState.TrialActive -> {
            val hours = state.remainingMillis / (1000 * 60 * 60)
            val minutes = (state.remainingMillis % (1000 * 60 * 60)) / (1000 * 60)
            Box(
                modifier = modifier
                    .fillMaxWidth()
                    .background(Color(0xFFB45309))
                    .clickable { onManageClicked() }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.HourglassTop,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = " 24-HOUR PRO TRIAL: ${hours}h ${minutes}m REMAINING · TAP TO SUBSCRIBE",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 0.5.sp
                    )
                }
            }
        }
        is EntitlementState.Subscribed -> {
            Box(
                modifier = modifier
                    .fillMaxWidth()
                    .background(Color(0xFF065F46))
                    .clickable { onManageClicked() }
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Verified,
                        contentDescription = null,
                        tint = Color(0xFF34D399),
                        modifier = Modifier.size(13.dp)
                    )
                    Text(
                        text = " PRO SUBSCRIBED · DEVICE AUTHORIZED",
                        color = Color(0xFFD1FAE5),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                }
            }
        }
        is EntitlementState.ReviewerActive -> {
            Box(
                modifier = modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1E293B))
                    .clickable { onManageClicked() }
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Star,
                        contentDescription = null,
                        tint = Color(0xFFFFC52F),
                        modifier = Modifier.size(13.dp)
                    )
                    Text(
                        text = " GOOGLE PLAY REVIEWER ACCESS ACTIVE",
                        color = Color(0xFFFFE082),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )
                }
            }
        }
        else -> Unit
    }
}
