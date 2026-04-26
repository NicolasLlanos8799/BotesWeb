document.addEventListener("DOMContentLoaded", async () => {
  console.log("Success Page: Logic initiated");
  const params = new URLSearchParams(window.location.search);
  const checkoutId = params.get("checkout_id") || params.get("s_id"); 
  
  const titleEl = document.getElementById("status-title");
  const textEl = document.getElementById("status-text");
  const iconEl = document.getElementById("status-icon");
  const actionEl = document.getElementById("action-container");

  if (!checkoutId) {
    showError("No payment session found. If you believe this is an error, please contact us.");
    return;
  }

  try {
    // 1. Verify status with SumUp through our proxy
    textEl.textContent = "Verifying payment with SumUp...";
    const response = await fetch(`/api/sumup?action=getCheckoutStatus&checkout_id=${checkoutId}`);
    if (!response.ok) throw new Error("Failed to verify payment status with SumUp.");
    
    const checkout = await response.json();

    if (checkout.status === "PAID") {
      textEl.textContent = "Payment Verified. Synchronizing with Google Calendar...";
      
      // 2. Retrieve booking data from metadata (SumUp) or localStorage
      const bookingDataRaw = localStorage.getItem("pending_booking_data");
      const bookingData = checkout.metadata || (bookingDataRaw ? JSON.parse(bookingDataRaw) : null);

      if (bookingData) {
        // 3. Create the booking for the first time (PAID)
        const gasResponse = await fetch("/api/proxy?action=createBooking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
             ...bookingData,
             payment_status: "PAID",
             sumup_checkout_id: checkoutId
          })
        });

        if (gasResponse.ok) {
          showSuccess(bookingData.tourTitle || "your experience");
          localStorage.removeItem("pending_booking_data");
        } else {
          const gasError = await gasResponse.text();
          throw new Error("Google Script Error: " + gasError);
        }
      } else {
        showSuccess(); // Basic success if no data found
      }
    } else if (checkout.status === "PENDING") {
       showError("Your payment is still pending in SumUp. Please wait and refresh.");
    } else {
      showError(`Payment not successful (Status: ${checkout.status}).`);
    }

  } catch (error) {
    console.error("Success page error:", error);
    showError("Could not finalize reservation with Google: " + error.message);
  }

  function showSuccess(tourTitle = "") {
    if (iconEl) {
      iconEl.className = "success-icon";
      iconEl.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#2e7d32" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }
    if (titleEl) titleEl.textContent = "Booking Confirmed!";
    
    // Populate Detailed Summary if data is available
    const summaryContainer = document.getElementById("reservation-summary");
    const summaryContent = document.getElementById("summary-content");
    const bookingDataRaw = localStorage.getItem("pending_booking_data");
    const data = bookingDataRaw ? JSON.parse(bookingDataRaw) : null;

    if (data && summaryContainer && summaryContent) {
      summaryContainer.style.display = "block";
      summaryContent.innerHTML = `
        <div><strong>Experience:</strong> ${data.tourTitle || data.tour}</div>
        <div><strong>Date:</strong> ${data.date}</div>
        <div><strong>Time:</strong> ${data.time}</div>
        <div><strong>Participants:</strong> ${data.qty} persona(s)</div>
        ${data.tapas && data.tapas !== "0" ? `<div><strong>Extras:</strong> ${data.tapas} Tapas Package</div>` : ''}
      `;
    }

    if (textEl) textEl.textContent = tourTitle 
      ? `Success! Your booking for "${tourTitle}" is finalized.`
      : "Success! Your payment has been processed and your reservation is now finalized.";
    
    if (actionEl) actionEl.style.display = "block";
  }

  function showPartialSuccess(msg) {
    if (iconEl) {
      iconEl.className = "success-icon";
      iconEl.style.background = "#fff8e1";
      iconEl.style.color = "#f57c00";
      iconEl.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    }
    if (titleEl) titleEl.textContent = "Payment Received";
    if (textEl) textEl.textContent = msg;
    if (actionEl) actionEl.style.display = "block";
  }

  function showError(msg) {
    if (iconEl) {
      iconEl.className = "success-icon";
      iconEl.style.background = "#ffebee";
      iconEl.style.color = "#c62828";
      iconEl.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    }
    if (titleEl) titleEl.textContent = "Payment Issue";
    if (textEl) textEl.textContent = msg;
    if (actionEl) actionEl.style.display = "block";
  }
});
