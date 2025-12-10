const mapApp = {
  map: null,
  allMarkers: [],
  currentMarkers: [],
  userFavorites: new Set(),

  init() {
    console.log("Initializing map app...");
    this.initMap();
    this.loadStops();
    this.initSearchHandler();
    this.toggleView();
  },

  initMap() {
    console.log("Initializing map...");
    const urlParams = new URLSearchParams(window.location.search);
    const lat = urlParams.get("lat") || 51.455;
    const lng = urlParams.get("lng") || -2.587;
    const zoom = urlParams.get("lat") ? 15 : 12;

    this.map = L.map("map").setView([lat, lng], zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
      this.map
    );
    console.log("Map initialized");
  },

  createIcon() {
    return L.divIcon({
      html: '<i class="fas fa-bus" style="color:#e74c3c;font-size:18px;background:white;border-radius:50%;padding:6px;"></i>',
      className: "",
      iconSize: [30, 30],
    });
  },

  createFavoriteIcon() {
    return L.divIcon({
      html: '<i class="fas fa-bus" style="color:#ff6b6b;font-size:18px;background:white;border-radius:50%;padding:6px;"></i>',
      className: "",
      iconSize: [30, 30],
    });
  },

  async loadStops() {
    try {
      console.log("Loading bus stops...");
      const r = await fetch("/api/busstops");
      if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);

      const json = await r.json();
      console.log("Loaded stops:", json.features?.length || 0);

      await this.loadUserFavorites();

      const features = json.features.slice(0, this.MAX);
      const icon = this.createIcon();
      const favoriteIcon = this.createFavoriteIcon();

      features.forEach((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;

        const isFavorite = this.userFavorites.has(p.ATCO_CODE);
        const marker = L.marker([lat, lng], {
          icon: isFavorite ? favoriteIcon : icon,
        }).addTo(this.map);

        marker.bindPopup(`
          <div class="popup-content">
            <h3>${p.NAME_INDICATOR || "Unknown Stop"}</h3>
            <p><strong>Street:</strong> ${p.STREET_NAME || "N/A"}</p>
            <p><strong>Locality:</strong> ${p.LOCALITY_NAME2 || "N/A"}</p>
            <p><strong>Authority:</strong> ${p.LOCAL_AUTHORITY || "N/A"}</p>
            <p><strong>Lines:</strong> ${p.LINE_DIR_LIST || "N/A"}</p>
            <p><strong>ATCO Code:</strong> ${p.ATCO_CODE || "N/A"}</p>
            <div class="popup-actions">
              <button onclick="mapApp.toggleFavorite('${
                p.ATCO_CODE
              }')" class="favorite-btn ${isFavorite ? "favorited" : ""}">
                <i class="fas fa-heart"></i> ${
                  isFavorite ? "Remove from Favorites" : "Add to Favorites"
                }
              </button>
            </div>
          </div>
        `);

        marker.bindTooltip(
          `<strong>${p.NAME_INDICATOR}</strong><br>${p.STREET_NAME || ""}`
        );

        marker.stopData = {
          name: p.NAME_INDICATOR || "",
          street: p.STREET_NAME || "",
          locality: p.LOCALITY_NAME2 || "",
          authority: p.LOCAL_AUTHORITY || "",
          lines: p.LINE_DIR_LIST || "",
          atco: p.ATCO_CODE || "",
          lat: lat,
          lng: lng,
          isFavorite: isFavorite,
          name_lower: (p.NAME_INDICATOR || "").toLowerCase(),
          street_lower: (p.STREET_NAME || "").toLowerCase(),
          locality_lower: (p.LOCALITY_NAME2 || "").toLowerCase(),
          authority_lower: (p.LOCAL_AUTHORITY || "").toLowerCase(),
          lines_lower: (p.LINE_DIR_LIST || "").toLowerCase(),
          atco_lower: (p.ATCO_CODE || "").toLowerCase(),
        };

        this.allMarkers.push(marker);
      });

      this.currentMarkers = [...this.allMarkers];
      this.populateAuthorityList();
      this.populateTable();
      this.updateStatus(`${this.allMarkers.length} stops loaded`);
    } catch (error) {
      console.error("Error loading stops:", error);
      this.updateStatus("Error loading bus stops");
    }
  },

  async loadUserFavorites() {
    try {
      const response = await fetch("/get_favorites_count");
      if (response.ok) {
        const result = await response.json();
        console.log(`User has ${result.count} favorites`);

        if (result.count > 0) {
          const favResponse = await fetch("/api/user_favorites");
          if (favResponse.ok) {
            const favData = await favResponse.json();
            this.userFavorites = new Set(
              favData.features.map((f) => f.properties.atco)
            );
            console.log(
              "Loaded user favorites:",
              Array.from(this.userFavorites)
            );
          }
        }
      }
    } catch (error) {
      console.error("Error loading user favorites:", error);
    }
  },

  toggleView() {
    const toggle = document.getElementById("viewToggle");
    if (!toggle) {
      console.error("Toggle element not found");
      return;
    }

    const on = toggle.checked;
    const mapView = document.getElementById("map-view");
    const tableView = document.getElementById("table-view");

    if (mapView) mapView.classList.toggle("active-view", !on);
    if (tableView) tableView.classList.toggle("active-view", on);

    const mapSearch = document.getElementById("map-search");
    const tableSearch = document.getElementById("table-search");
    const quickActions = document.querySelector(".quick-actions");

    if (on) {
      if (mapSearch) mapSearch.style.display = "none";
      if (tableSearch) tableSearch.style.display = "block";
      if (quickActions) quickActions.style.display = "none";
    } else {
      if (mapSearch) mapSearch.style.display = "block";
      if (tableSearch) tableSearch.style.display = "none";
      if (quickActions) quickActions.style.display = "block";
    }

    if (!on && this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
      }, 300);
    }
  },

  initSearchHandler() {
    const mapSearch = document.getElementById("mapSearch");
    const tableSearch = document.getElementById("tableSearch");

    if (mapSearch) {
      mapSearch.addEventListener("input", () => {
        let q = mapSearch.value.toLowerCase();
        this.filterMarkers(q);
      });
    }

    if (tableSearch) {
      tableSearch.addEventListener("input", () => {
        let q = tableSearch.value.toLowerCase();
        this.filterTable(q);
      });
    }
  },

  filterMarkers(q) {
    this.allMarkers.forEach((m) => {
      const d = m.stopData;
      const match =
        d.name_lower.includes(q) ||
        d.street_lower.includes(q) ||
        d.locality_lower.includes(q) ||
        d.authority_lower.includes(q) ||
        d.lines_lower.includes(q);

      if (match) {
        this.map.addLayer(m);
      } else {
        this.map.removeLayer(m);
      }
    });
    this.updateStatus("Filtered results");
  },

  populateTable() {
    const tableBody = document.getElementById("table-body");
    if (!tableBody) {
      console.error("Table body not found");
      return;
    }

    let out = "";
    this.allMarkers.forEach((m) => {
      const d = m.stopData;
      out += `
        <tr>
          <td>${d.name || "N/A"}</td>
          <td>${d.street || "N/A"}</td>
          <td>${d.locality || "N/A"}</td>
          <td>${d.authority || "N/A"}</td>
          <td>${d.lines || "N/A"}</td>
          <td>${d.atco || "N/A"}</td>
          <td>
            <button onclick="mapApp.toggleFavorite('${
              d.atco
            }')" class="favorite-btn ${d.isFavorite ? "favorited" : ""}">
              <i class="fas fa-heart"></i> ${d.isFavorite ? "★" : "☆"}
            </button>
          </td>
        </tr>`;
    });
    tableBody.innerHTML = out;
  },

  filterTable(q) {
    const rows = document.querySelectorAll("#table-body tr");
    rows.forEach((row) => {
      const rowText = row.textContent.toLowerCase();
      row.style.display = rowText.includes(q) ? "" : "none";
    });
  },

  async toggleFavorite(atcoCode) {
    const marker = this.allMarkers.find((m) => m.stopData.atco === atcoCode);

    if (!marker) return;

    const isCurrentlyFavorite = marker.stopData.isFavorite;

    try {
      const stopData = {
        atco: atcoCode,
        name: marker.stopData.name,
        street: marker.stopData.street,
        locality: marker.stopData.locality,
        authority: marker.stopData.authority,
        lines: marker.stopData.lines,
        lat: marker.stopData.lat,
        lng: marker.stopData.lng,
      };

      const csrfToken =
        document
          .querySelector('meta[name="csrf-token"]')
          ?.getAttribute("content") || "";
      const response = await fetch("/toggle_favorite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify(stopData),
      });

      const result = await response.json();

      if (result.success) {
        if (result.action === "added") {
          marker.stopData.isFavorite = true;
          this.userFavorites.add(atcoCode);
          marker.setIcon(this.createFavoriteIcon());
          this.updateStatus("Added to favorites!");
        } else {
          marker.stopData.isFavorite = false;
          this.userFavorites.delete(atcoCode);
          marker.setIcon(this.createIcon());
          this.updateStatus("Removed from favorites");
        }

        marker.bindPopup(`
          <div class="popup-content">
            <h3>${marker.stopData.name || "Unknown Stop"}</h3>
            <p><strong>Street:</strong> ${marker.stopData.street || "N/A"}</p>
            <p><strong>Locality:</strong> ${
              marker.stopData.locality || "N/A"
            }</p>
            <p><strong>Authority:</strong> ${
              marker.stopData.authority || "N/A"
            }</p>
            <p><strong>Lines:</strong> ${marker.stopData.lines || "N/A"}</p>
            <p><strong>ATCO Code:</strong> ${marker.stopData.atco || "N/A"}</p>
            <div class="popup-actions">
              <button onclick="mapApp.toggleFavorite('${atcoCode}')" class="favorite-btn ${
          marker.stopData.isFavorite ? "favorited" : ""
        }">
                <i class="fas fa-heart"></i> ${
                  marker.stopData.isFavorite
                    ? "Remove from Favorites"
                    : "Add to Favorites"
                }
              </button>
            </div>
          </div>
        `);

        this.updateTableFavorites();

        if (typeof updateFavoritesBadge === "function") {
          await updateFavoritesBadge();
        }
      } else {
        this.updateStatus(
          "Error: " + (result.error || "Failed to update favorite")
        );
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      this.updateStatus("Network error. Please try again.");
    }
  },

  updateTableFavorites() {
    document.querySelectorAll("#table-body tr").forEach((row, index) => {
      if (index < this.allMarkers.length) {
        const marker = this.allMarkers[index];
        const favoriteBtn = row.querySelector(".favorite-btn");
        if (favoriteBtn) {
          favoriteBtn.className = `favorite-btn ${
            marker.stopData.isFavorite ? "favorited" : ""
          }`;
          favoriteBtn.innerHTML = `<i class="fas fa-heart"></i> ${
            marker.stopData.isFavorite ? "★" : "☆"
          }`;
        }
      }
    });
  },

  toggleAuthorityList() {
    const authorityList = document.getElementById("authority-list");
    if (authorityList) {
      authorityList.classList.toggle("expanded");
    }
  },

  populateAuthorityList() {
    const list = document.getElementById("authority-list");
    if (!list) return;

    list.innerHTML = "";
    const auth = [...new Set(this.allMarkers.map((m) => m.stopData.authority))];

    auth.forEach((a) => {
      if (!a.trim()) return;

      const div = document.createElement("div");
      div.className = "authority-item";
      div.innerHTML = `
        <input type="checkbox" value="${a}">
        <label>${a}</label>
      `;
      list.appendChild(div);
    });

    list.addEventListener("change", () => this.applyAuthorityFilter());
  },

  applyAuthorityFilter() {
    const checked = [
      ...document.querySelectorAll("#authority-list input:checked"),
    ].map((x) => x.value);

    if (checked.length === 0) {
      this.showAllStops();
      this.showAllTableRows();
      return;
    }

    this.allMarkers.forEach((m) => {
      if (checked.includes(m.stopData.authority)) {
        this.map.addLayer(m);
      } else {
        this.map.removeLayer(m);
      }
    });

    document.querySelectorAll("#table-body tr").forEach((row, index) => {
      if (index < this.allMarkers.length) {
        const marker = this.allMarkers[index];
        const shouldShow = checked.includes(marker.stopData.authority);
        row.style.display = shouldShow ? "" : "none";
      }
    });

    this.updateStatus("Authority filter applied");
  },

  showAllTableRows() {
    document.querySelectorAll("#table-body tr").forEach((row) => {
      row.style.display = "";
    });
  },

  showAllStops() {
    this.allMarkers.forEach((m) => this.map.addLayer(m));
    this.updateStatus("Showing all stops");
  },

  clearMap() {
    this.allMarkers.forEach((m) => this.map.removeLayer(m));
    this.updateStatus("Map cleared");
  },

  zoomToBristol() {
    this.map.setView([51.455, -2.587], 12);
    this.updateStatus("Zoomed to Bristol");
  },

  findNearestStop() {
    if (!navigator.geolocation) {
      this.updateStatus("Geolocation not supported by your browser");
      this.zoomToBristol();
      return;
    }

    this.updateStatus("Getting your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;

        this.map.setView([userLat, userLng], 15);

        const userIcon = L.divIcon({
          html: '<i class="fas fa-user" style="color: #667eea; font-size: 18px; background: white; border-radius: 50%; padding: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></i>',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const userMarker = L.marker([userLat, userLng], { icon: userIcon })
          .addTo(this.map)
          .bindPopup("<b>You are here</b>")
          .openPopup();

        const distances = this.allMarkers.map((marker) => {
          const pos = marker.getLatLng();
          const distance = this.haversine(userLat, userLng, pos.lat, pos.lng);
          return { marker, distance };
        });

        distances.sort((a, b) => a.distance - b.distance);
        const nearest = distances.slice(0, 5).map((d) => d.marker);

        this.allMarkers.forEach((m) => this.map.removeLayer(m));

        nearest.forEach((m) => this.map.addLayer(m));

        const group = new L.featureGroup([...nearest, userMarker]);
        this.map.fitBounds(group.getBounds().pad(0.2));

        this.updateStatus("Showing the 5 nearest bus stops to you");
      },
      () => {
        this.updateStatus("Could not get your location. Using Bristol center.");
        this.zoomToBristol();
      }
    );
  },

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  updateStatus(msg) {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.textContent = msg;
    }
  },
};

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing map app...");
  mapApp.init();
});
