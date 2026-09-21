document.addEventListener('DOMContentLoaded', () => {
    initMap();
});

// Control custom: botón para volver a vista superior (pitch/bearing en 0)
class ResetViewControl {
    constructor(center) {
        this.center = center;
    }

    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Vista superior';
        button.innerHTML = '<i class="fa-solid fa-compass"></i>';
        button.addEventListener('click', () => {
            this.map.flyTo({
                center: this.center,
                zoom: 13,
                pitch: 0,
                bearing: 0,
                speed: 1.2,
                essential: true
            });
        });

        this.container.appendChild(button);
        return this.container;
    }

    onRemove() {
        this.container.parentNode.removeChild(this.container);
        this.map = undefined;
    }
}

// Control custom: mostrar/ocultar líneas de conexión entre estudiantes
class ConnectionsToggleControl {
    constructor(layerId) {
        this.layerId = layerId;
        this.visible = true;
    }

    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.title = 'Conexiones entre estudiantes';
        this.button.innerHTML = '<i class="fa-solid fa-diagram-project"></i>';
        this.button.addEventListener('click', () => {
            this.visible = !this.visible;
            this.button.classList.toggle('ctrl-active', this.visible);
            if (this.map.getLayer(this.layerId)) {
                this.map.setLayoutProperty(this.layerId, 'visibility', this.visible ? 'visible' : 'none');
            }
        });
        this.button.classList.add('ctrl-active');

        this.container.appendChild(this.button);
        return this.container;
    }

    onRemove() {
        this.container.parentNode.removeChild(this.container);
        this.map = undefined;
    }
}

async function initMap() {
    // --- 1. Map Initialization (MapLibre GL + OpenFreeMap Liberty Style) ---
    // Cali Coordinates: 3.4516, -76.5320
    const caliCoords = [-76.5320, 3.4516]; // MapLibre usa [lng, lat]

    const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: caliCoords,
        zoom: 13
    });

    // Add zoom control
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // Add "reset view" control (vuelve a vista superior)
    map.addControl(new ResetViewControl(caliCoords), 'bottom-right');

    // --- 2. Fetch and Render Student Data ---
    try {
        // Fetch the index of student files
        const indexResponse = await fetch('data/index.json');
        if (!indexResponse.ok) throw new Error('Failed to load student index');
        const fileList = await indexResponse.json();

        // Fetch all student files in parallel
        const studentsData = await Promise.all(
            fileList.map(async (fileName) => {
                const response = await fetch(`data/students/${fileName}`);
                if (!response.ok) {
                    console.warn(`Failed to load student file: ${fileName}`);
                    return null;
                }
                return response.json();
            })
        );

        // Filter out any failed loads
        const validStudents = studentsData.filter(student => student !== null);

        const studentMarkers = renderMarkers(map, validStudents);
        addConnectionsLayer(map, validStudents);
        flyToDeepLinkedStudent(map, studentMarkers);

    } catch (error) {
        console.error('Error loading student data:', error);
        // Fallback for file:// protocol issues if user opens directly
        if (window.location.protocol === 'file:') {
            alert('Note: Fetch API may not work when opening HTML files directly due to CORS. Please use a local server (e.g., Live Server extension in VS Code).');
        }
    }
}

const ICON_MAP = {
        'ajedrez': 'fa-chess',
    'hamburguesas': 'fa-burger',
    'arepas': 'fa-cookie',
    'pizza': 'fa-pizza-slice',
    'música': 'fa-music',
    'salsa': 'fa-music',
    'café': 'fa-mug-hot',
    'ciclismo': 'fa-bicycle',
    'bicicleta': 'fa-bicycle',
    'gatos': 'fa-cat',
    'perros': 'fa-dog',
    'gaming': 'fa-gamepad',
    'fotografía': 'fa-camera',
    'finanzas': 'fa-chart-line',
    'naturaleza': 'fa-tree',
    'yoga': 'fa-person-praying',
    'ux design': 'fa-pen-ruler',
    'react.js': 'fa-brands fa-react',
    'python': 'fa-brands fa-python'
};

function getIconForLike(text) {
    const lower = text.toLowerCase();
    for (const [key, iconClass] of Object.entries(ICON_MAP)) {
        if (lower.includes(key)) return iconClass;
    }
    return 'fa-tag';
}

function getIconForLikes(likes) {
    for (const like of likes) {
        const icon = getIconForLike(like);
        if (icon !== 'fa-tag') return icon;
    }
    return 'fa-user';
}

// Aclara un color hex un porcentaje dado (0-100), para crear gradientes
function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const r = Math.min(255, (num >> 16) + amt);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const b = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function buildStars(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += `<i class="fa-solid fa-star${i <= rating ? '' : ' star-empty'}"></i>`;
    }
    return html;
}

function socialLink(handle) {
    const clean = handle.replace('@', '');
    return `https://instagram.com/${clean}`;
}

function renderMarkers(map, students) {
    const studentMarkers = {};

    students.forEach(student => {
        const color = student.color || '#6C5CE7';
        const lightColor = lightenColor(color, 25);
        const iconClass = getIconForLikes(student.likes || []);

        // Create custom marker element (color propio del estudiante)
        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.background = `linear-gradient(135deg, ${color}, ${lightColor})`;
        el.style.boxShadow = `0 4px 15px ${color}66`;
        el.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;

        const photos = student.photos && student.photos.length ? student.photos : [student.photo];

        const likesHtml = (student.likes || []).map(t =>
            `<span class="tag like"><i class="fa-solid ${getIconForLike(t)}"></i> ${t}</span>`
        ).join('');
        const dislikesHtml = (student.dislikes || []).map(t => `<span class="tag dislike">${t}</span>`).join('');

        const photoHtml = photos[0]
            ? `<img src="${photos[0]}" alt="${student.name}" class="student-photo" style="border-color:${color}" data-photo-img>`
            : `<div class="student-photo-placeholder"><i class="fa-solid fa-user"></i></div>`;

        const carouselDots = photos.length > 1
            ? `<div class="carousel-dots">${photos.map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>
               <button class="carousel-btn prev" data-carousel-prev><i class="fa-solid fa-chevron-left"></i></button>
               <button class="carousel-btn next" data-carousel-next><i class="fa-solid fa-chevron-right"></i></button>`
            : '';

        const topLikeHtml = student.topLike
            ? `<div class="popup-section stars-row">
                   <span class="section-title">${student.topLike.name}</span>
                   <span class="stars">${buildStars(student.topLike.rating)}</span>
               </div>`
            : '';

        const funFactHtml = student.funFact
            ? `<div class="fun-fact"><i class="fa-solid fa-lightbulb"></i> ${student.funFact}</div>`
            : '';

        const toolHtml = student.favoriteTool
            ? `<span class="badge-pill"><i class="${student.favoriteTool.icon}"></i> ${student.favoriteTool.name}</span>`
            : '';

        const superpowerHtml = student.superpower
            ? `<span class="badge-pill superpower"><i class="fa-solid fa-bolt"></i> ${student.superpower}</span>`
            : '';

        const songHtml = student.song
            ? `<a href="${student.song.url}" target="_blank" rel="noopener" class="song-link">
                   <i class="fa-solid fa-music"></i> ${student.song.title} — ${student.song.artist}
               </a>`
            : '';

        const topSpotsHtml = student.topSpots && student.topSpots.length
            ? `<div class="popup-section">
                   <span class="section-title">Top lugares en Cali</span>
                   <ul class="spots-list">${student.topSpots.map(s => `<li><i class="fa-solid fa-location-dot"></i> ${s}</li>`).join('')}</ul>
               </div>`
            : '';

        const popupContent = `
            <div class="popup-card">
                <div class="popup-header">
                    <div class="photo-carousel" data-photos='${JSON.stringify(photos)}' data-index="0">
                        ${photoHtml}
                        ${carouselDots}
                    </div>
                    <div class="profile-info">
                        <div class="text-info">
                            <h3>${student.name}</h3>
                            <a href="${socialLink(student.socialMedia)}" target="_blank" rel="noopener" class="social-handle">${student.socialMedia}</a>
                            ${student.vibe ? `<span class="vibe-tag">${student.vibe}</span>` : ''}
                        </div>
                    </div>
                    ${student.quote ? `<p class="quote">"${student.quote}"</p>` : ''}
                </div>

                ${topLikeHtml}

                <div class="popup-section">
                    <span class="section-title">Le gusta</span>
                    <div class="tags-container">${likesHtml}</div>
                </div>
                <div class="popup-section">
                    <span class="section-title">No le gusta</span>
                    <div class="tags-container">${dislikesHtml}</div>
                </div>

                ${funFactHtml}

                <div class="popup-section badges-row">
                    ${toolHtml}
                    ${superpowerHtml}
                </div>

                ${songHtml}
                ${topSpotsHtml}

                <button class="share-btn" data-share-id="${student.id}">
                    <i class="fa-solid fa-share-nodes"></i> Compartir perfil
                </button>
            </div>
        `;

        const popup = new maplibregl.Popup({
            closeButton: false,
            offset: 26,
            maxWidth: '300px',
            className: 'custom-popup-container'
        }).setHTML(popupContent);

        // Add marker to map
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([student.lng, student.lat])
            .setPopup(popup)
            .addTo(map);

        // Hover con margen: da tiempo de mover el mouse del marker al popup sin que se cierre
        let closeTimer = null;
        const cancelClose = () => {
            if (closeTimer) {
                clearTimeout(closeTimer);
                closeTimer = null;
            }
        };
        const scheduleClose = () => {
            cancelClose();
            closeTimer = setTimeout(() => {
                if (popup.isOpen()) marker.togglePopup();
            }, 250);
        };

        // Cablear interacciones dentro del popup (una sola vez, al abrir por primera vez)
        popup.on('open', () => {
            const container = popup.getElement();
            if (!container || container.dataset.bound) return;
            container.dataset.bound = 'true';
            wirePopupInteractions(container, student);
            container.addEventListener('mouseenter', cancelClose);
            container.addEventListener('mouseleave', scheduleClose);
        });

        // Hover Events
        el.addEventListener('mouseenter', () => {
            cancelClose();
            if (!popup.isOpen()) marker.togglePopup();
        });

        el.addEventListener('mouseleave', scheduleClose);

        // Click: vuelo cinemático hacia el estudiante
        el.addEventListener('click', () => {
            map.flyTo({
                center: [student.lng, student.lat],
                zoom: 17,
                pitch: 55,
                bearing: Math.random() * 90 - 45,
                speed: 0.8,
                curve: 1.4,
                essential: true
            });
        });

        studentMarkers[student.id] = { marker, popup, student };
    });

    return studentMarkers;
}

function wirePopupInteractions(container, student) {
    // Carrusel de fotos
    const carousel = container.querySelector('.photo-carousel');
    if (carousel) {
        const photos = JSON.parse(carousel.dataset.photos);
        const img = carousel.querySelector('[data-photo-img]');
        const dots = carousel.querySelectorAll('.dot');
        const setIndex = (i) => {
            const idx = (i + photos.length) % photos.length;
            carousel.dataset.index = idx;
            if (img) img.src = photos[idx];
            dots.forEach((d, di) => d.classList.toggle('active', di === idx));
        };
        const prevBtn = carousel.querySelector('[data-carousel-prev]');
        const nextBtn = carousel.querySelector('[data-carousel-next]');
        if (prevBtn) prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setIndex(parseInt(carousel.dataset.index, 10) - 1);
        });
        if (nextBtn) nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setIndex(parseInt(carousel.dataset.index, 10) + 1);
        });
    }

    // Botón compartir: copia deep-link al portapapeles
    const shareBtn = container.querySelector('.share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const url = new URL(window.location.href);
            url.searchParams.set('student', student.id);
            try {
                await navigator.clipboard.writeText(url.toString());
                const original = shareBtn.innerHTML;
                shareBtn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Enlace copiado!';
                setTimeout(() => { shareBtn.innerHTML = original; }, 1500);
            } catch (err) {
                console.warn('No se pudo copiar el enlace:', err);
            }
        });
    }
}

// Si la URL trae ?student=<id>, vuela hacia ese estudiante y abre su popup
function flyToDeepLinkedStudent(map, studentMarkers) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('student');
    if (!id || !studentMarkers[id]) return;

    const { marker, student } = studentMarkers[id];
    map.flyTo({
        center: [student.lng, student.lat],
        zoom: 17,
        pitch: 55,
        speed: 0.8,
        curve: 1.4,
        essential: true
    });
    map.once('moveend', () => marker.togglePopup());
}

// Dibuja líneas entre estudiantes que comparten al menos un "like"
function addConnectionsLayer(map, students) {
    const features = [];

    for (let i = 0; i < students.length; i++) {
        for (let j = i + 1; j < students.length; j++) {
            const a = students[i];
            const b = students[j];
            const aLikes = (a.likes || []).map(l => l.toLowerCase());
            const bLikes = (b.likes || []).map(l => l.toLowerCase());
            const shared = a.likes.filter(l => bLikes.includes(l.toLowerCase()));

            if (shared.length > 0) {
                features.push({
                    type: 'Feature',
                    properties: { shared: shared.join(', ') },
                    geometry: {
                        type: 'LineString',
                        coordinates: [[a.lng, a.lat], [b.lng, b.lat]]
                    }
                });
            }
        }
    }

    if (features.length === 0) return;

    const geojson = { type: 'FeatureCollection', features };

    const addLayer = () => {
        if (map.getSource('connections')) return;
        map.addSource('connections', { type: 'geojson', data: geojson });
        map.addLayer({
            id: 'connections-layer',
            type: 'line',
            source: 'connections',
            paint: {
                'line-color': '#6C5CE7',
                'line-width': 2,
                'line-dasharray': [2, 2],
                'line-opacity': 0.6
            }
        });
        map.addControl(new ConnectionsToggleControl('connections-layer'), 'bottom-right');

        // Tooltip simple al pasar sobre una línea
        const connectionPopup = new maplibregl.Popup({ closeButton: false, offset: 8 });
        map.on('mouseenter', 'connections-layer', (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const shared = e.features[0].properties.shared;
            connectionPopup.setLngLat(e.lngLat).setHTML(`<div class="connection-tooltip">🤝 ${shared}</div>`).addTo(map);
        });
        map.on('mouseleave', 'connections-layer', () => {
            map.getCanvas().style.cursor = '';
            connectionPopup.remove();
        });
    };

    if (map.isStyleLoaded()) addLayer();
    else map.once('load', addLayer);
}
