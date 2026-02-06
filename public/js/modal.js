// Modal Utility - Custom modals to replace browser alerts/confirms
var Modal = (function () {
  var modalContainer = null;

  function init() {
    if (modalContainer) return;

    // Create modal container
    modalContainer = document.createElement("div");
    modalContainer.id = "modal-container";
    document.body.appendChild(modalContainer);
  }

  function createModal(options) {
    init();

    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    var iconHtml = "";
    if (options.icon) {
      if (options.icon === "loading") {
        iconHtml =
          '<div class="modal-icon loading"><div class="spinner large"></div></div>';
      } else {
        var iconEmoji =
          options.icon === "success"
            ? "✅"
            : options.icon === "error"
              ? "❌"
              : options.icon === "warning"
                ? "⚠️"
                : "ℹ️";
        iconHtml =
          '<div class="modal-icon ' +
          options.icon +
          '">' +
          iconEmoji +
          "</div>";
      }
    }

    var footerHtml = "";
    if (options.buttons && options.buttons.length > 0) {
      footerHtml = '<div class="modal-footer">';
      options.buttons.forEach(function (btn, index) {
        footerHtml +=
          '<button class="btn ' +
          (btn.class || "btn-outline") +
          '" data-action="' +
          index +
          '">' +
          btn.text +
          "</button>";
      });
      footerHtml += "</div>";
    }

    overlay.innerHTML =
      '<div class="modal">' +
      '<div class="modal-header">' +
      '<div class="modal-title">' +
      (options.title || "") +
      "</div>" +
      (options.closable !== false
        ? '<button class="modal-close" data-close>&times;</button>'
        : "") +
      "</div>" +
      '<div class="modal-body">' +
      iconHtml +
      '<div class="modal-message">' +
      (options.message || "") +
      "</div>" +
      (options.content || "") +
      "</div>" +
      footerHtml +
      "</div>";

    modalContainer.appendChild(overlay);

    // Animate in
    requestAnimationFrame(function () {
      overlay.classList.add("active");
    });

    // Setup event handlers
    var closeBtn = overlay.querySelector("[data-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        close(overlay);
        if (options.onClose) options.onClose();
      });
    }

    // Button handlers
    if (options.buttons) {
      options.buttons.forEach(function (btn, index) {
        var btnEl = overlay.querySelector('[data-action="' + index + '"]');
        if (btnEl) {
          btnEl.addEventListener("click", function () {
            if (btn.onClick) btn.onClick();
            if (btn.closeOnClick !== false) {
              close(overlay);
            }
          });
        }
      });
    }

    // Click outside to close
    if (options.closable !== false) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          close(overlay);
          if (options.onClose) options.onClose();
        }
      });
    }

    return overlay;
  }

  function close(overlay) {
    overlay.classList.remove("active");
    setTimeout(function () {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 300);
  }

  function closeAll() {
    var overlays = document.querySelectorAll(".modal-overlay");
    overlays.forEach(function (overlay) {
      close(overlay);
    });
  }

  // Show loading modal
  function loading(message) {
    return createModal({
      title: "Please Wait",
      message: message || "Loading...",
      icon: "loading",
      closable: false,
      buttons: [],
    });
  }

  // Show success modal
  function success(title, message, onClose) {
    return createModal({
      title: title || "Success",
      message: message,
      icon: "success",
      closable: true,
      buttons: [
        {
          text: "OK",
          class: "btn-primary",
          onClick: onClose,
        },
      ],
    });
  }

  // Show error modal
  function error(title, message, onClose) {
    return createModal({
      title: title || "Error",
      message: message,
      icon: "error",
      closable: true,
      buttons: [
        {
          text: "OK",
          class: "btn-danger",
          onClick: onClose,
        },
      ],
    });
  }

  // Show warning modal
  function warning(title, message, onClose) {
    return createModal({
      title: title || "Warning",
      message: message,
      icon: "warning",
      closable: true,
      buttons: [
        {
          text: "OK",
          class: "btn-primary",
          onClick: onClose,
        },
      ],
    });
  }

  // Show info modal
  function info(title, message, onClose) {
    return createModal({
      title: title || "Info",
      message: message,
      icon: "info",
      closable: true,
      buttons: [
        {
          text: "OK",
          class: "btn-primary",
          onClick: onClose,
        },
      ],
    });
  }

  // Show confirm modal
  function confirm(title, message, onConfirm, onCancel) {
    return createModal({
      title: title || "Confirm",
      message: message,
      icon: "warning",
      closable: true,
      onClose: onCancel,
      buttons: [
        {
          text: "Cancel",
          class: "btn-outline",
          onClick: onCancel,
        },
        {
          text: "Confirm",
          class: "btn-danger",
          onClick: onConfirm,
        },
      ],
    });
  }

  // Show sync results modal
  function syncResults(title, results) {
    var summary = results.summary || {};
    var content =
      '<div class="sync-results">' +
      '<div class="sync-results-row">' +
      '<span class="sync-results-label">Total Accounts</span>' +
      '<span class="sync-results-value">' +
      (summary.total || 0) +
      "</span>" +
      "</div>" +
      '<div class="sync-results-row">' +
      '<span class="sync-results-label">Successful</span>' +
      '<span class="sync-results-value success">' +
      (summary.successful || 0) +
      "</span>" +
      "</div>" +
      '<div class="sync-results-row">' +
      '<span class="sync-results-label">Failed</span>' +
      '<span class="sync-results-value error">' +
      (summary.failed || 0) +
      "</span>" +
      "</div>" +
      "</div>";

    return createModal({
      title: title || "Sync Complete",
      message:
        summary.failed > 0
          ? "Sync completed with some errors."
          : "All accounts synced successfully!",
      icon: summary.failed > 0 ? "warning" : "success",
      content: content,
      closable: true,
      buttons: [
        {
          text: "OK",
          class: "btn-primary",
        },
      ],
    });
  }

  // Update loading modal message
  function updateLoading(overlay, message) {
    if (overlay) {
      var msgEl = overlay.querySelector(".modal-message");
      if (msgEl) {
        msgEl.textContent = message;
      }
    }
  }

  return {
    create: createModal,
    close: close,
    closeAll: closeAll,
    loading: loading,
    success: success,
    error: error,
    warning: warning,
    info: info,
    confirm: confirm,
    syncResults: syncResults,
    updateLoading: updateLoading,
  };
})();
