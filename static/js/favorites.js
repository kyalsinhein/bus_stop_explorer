function getCSRFToken() {
  const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
  return csrfTokenMeta ? csrfTokenMeta.getAttribute("content") : "";
}

async function checkFavorite(atcoCode) {
  try {
    const response = await fetch(`/check_favorite/${atcoCode}`);
    const result = await response.json();
    return result.is_favorite;
  } catch (error) {
    console.error("Error checking favorite:", error);
    return false;
  }
}

async function toggleFavorite(stopData) {
  try {
    const response = await fetch("/toggle_favorite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      body: JSON.stringify(stopData),
    });

    const result = await response.json();

    await updateFavoritesBadge();

    const sidebarBadge = document.getElementById("sidebar-favorites-badge");
    if (sidebarBadge) {
      const mainBadge = document.getElementById("favorites-badge");
      if (mainBadge && mainBadge.textContent) {
        sidebarBadge.textContent = mainBadge.textContent;
        sidebarBadge.style.display = "inline-block";
      }
    }

    return result;
  } catch (error) {
    console.error("Error toggling favorite:", error);
    return { success: false, error: "Network error" };
  }
}

async function handleFavoriteClick(stopData) {
  const result = await toggleFavorite(stopData);

  if (result.success) {
    const heartIcons = document.querySelectorAll(
      `[data-atco="${stopData.atco}"] .heart-icon`
    );
    heartIcons.forEach((heartIcon) => {
      if (result.action === "added") {
        heartIcon.classList.add("favorited");
        heartIcon.innerHTML = '<i class="fas fa-heart"></i>';
      } else {
        heartIcon.classList.remove("favorited");
        heartIcon.innerHTML = '<i class="far fa-heart"></i>';
      }
    });

    const tableButtons = document.querySelectorAll(
      `[data-atco="${stopData.atco}"].favorite-table-btn i`
    );
    tableButtons.forEach((icon) => {
      if (result.action === "added") {
        icon.className = "fas fa-heart";
        icon.style.color = "#ff4757";
      } else {
        icon.className = "far fa-heart";
        icon.style.color = "";
      }
    });
  }
}

async function updateFavoritesBadge() {
  try {
    const response = await fetch("/get_favorites_count");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();

    const badge = document.getElementById("favorites-badge");
    if (badge) {
      if (result.count > 0) {
        badge.textContent = result.count;
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    }

    const sidebarBadge = document.getElementById("sidebar-favorites-badge");
    if (sidebarBadge) {
      if (result.count > 0) {
        sidebarBadge.textContent = result.count;
        sidebarBadge.style.display = "inline-block";
      } else {
        sidebarBadge.style.display = "none";
      }
    }

    return result.count;
  } catch (error) {
    console.error("Error updating favorites badge:", error);
    return 0;
  }
}

async function removeFavoriteItem(atcoCode) {
  if (!confirm("Are you sure you want to remove this favorite?")) {
    return;
  }

  try {
    const response = await fetch("/remove_favorite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
      body: JSON.stringify({ atco_code: atcoCode }),
    });

    const result = await response.json();

    if (result.success) {
      const favoriteItem = document.getElementById(`favorite-${atcoCode}`);
      if (favoriteItem) {
        favoriteItem.remove();
      }

      await updateFavoritesBadge();

      const container = document.getElementById("favorites-container");
      if (container) {
        const favoriteItems = container.querySelectorAll(".favorite-item");
        if (favoriteItems.length === 0) {
          container.innerHTML = `
            <div class="no-favorites">
              <i class="fas fa-heart"></i>
              <h3>No favorite stops yet</h3>
              <p>Go back to the explorer and click the heart icon on bus stops to add them to favorites.</p>
            </div>
          `;
        }
      }
    } else {
      alert("Failed to remove favorite: " + (result.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error removing favorite:", error);
    alert("Failed to remove favorite. Please check your connection.");
  }
}

async function clearAllFavorites() {
  if (!confirm("Are you sure you want to remove ALL favorites?")) {
    return;
  }

  try {
    const response = await fetch("/clear_all_favorites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCSRFToken(),
      },
    });

    const result = await response.json();

    if (result.success) {
      const container = document.getElementById("favorites-container");
      if (container) {
        container.innerHTML = `
          <div class="no-favorites">
            <i class="fas fa-heart"></i>
            <h3>No favorite stops yet</h3>
            <p>Go back to the explorer and click the heart icon on bus stops to add them to favorites.</p>
          </div>
        `;
      }

      await updateFavoritesBadge();

      const heartIcons = document.querySelectorAll(".heart-icon");
      heartIcons.forEach((icon) => {
        icon.classList.remove("favorited");
        icon.innerHTML = '<i class="far fa-heart"></i>';
      });
    } else {
      alert("Failed to clear favorites: " + (result.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error clearing favorites:", error);
    alert("Failed to clear favorites. Please check your connection.");
  }
}

function viewOnMap(lat, lng) {
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
    window.location.href = `/explorer?lat=${parsedLat}&lng=${parsedLng}`;
  } else {
    console.error("Invalid lat/lng values:", lat, lng);
  }
}

function initializeFavoritesPage() {
  const container = document.getElementById("favorites-container");
  if (!container) return;
  console.log("Initializing favorites page functionality");

  document.addEventListener("click", function (e) {
    if (e.target.closest(".remove-favorite-btn")) {
      const button = e.target.closest(".remove-favorite-btn");
      const atcoCode = button.getAttribute("data-atco");
      if (atcoCode) {
        removeFavoriteItem(atcoCode);
      }
    }

    if (e.target.closest(".view-on-map-btn")) {
      const button = e.target.closest(".view-on-map-btn");
      const lat = button.getAttribute("data-lat");
      const lng = button.getAttribute("data-lng");
      if (lat && lng) {
        viewOnMap(lat, lng);
      }
    }

    if (e.target.closest("#clear-all-favorites-btn")) {
      clearAllFavorites();
    }
  });

  updateFavoritesBadge();
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM loaded - initializing favorites functionality");

  updateFavoritesBadge();

  initializeFavoritesPage();
});

window.updateFavoritesBadgeGlobal = updateFavoritesBadge;
window.toggleFavorite = toggleFavorite;
window.checkFavorite = checkFavorite;
window.removeFavoriteItem = removeFavoriteItem;
window.clearAllFavorites = clearAllFavorites;
window.viewOnMap = viewOnMap;
window.handleFavoriteClick = handleFavoriteClick;
