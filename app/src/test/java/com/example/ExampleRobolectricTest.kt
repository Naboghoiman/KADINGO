package com.example

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.example.security.EntitlementManager
import com.example.security.EntitlementState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExampleRobolectricTest {

  @Test
  fun `read string from context`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val appName = context.getString(R.string.app_name)
    assertEquals("DJ IMAN 3.4 Sync", appName)
  }

  @Test
  fun `entitlement initial trial is active`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val manager = EntitlementManager(context)
    val state = manager.state.value
    assertTrue("Initial state must be trial or subscribed", state is EntitlementState.TrialActive || state is EntitlementState.Subscribed)
  }

  @Test
  fun `reviewer secret code unlocks app`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val manager = EntitlementManager(context)
    val unlocked = manager.activateReviewerCode(EntitlementManager.REVIEWER_SECRET_CODE)
    assertTrue("Reviewer code should unlock", unlocked)
    assertEquals(EntitlementState.ReviewerActive, manager.state.value)
  }
}
