const status = document.querySelector('#dashboard-updated');

async function loadStatus() {
  try {
    const response = await fetch('assets/captures/status.json', { cache: 'no-store' });
    const { updatedAt } = await response.json();
    status.textContent = `Actualizado: ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))}`;
  } catch {
    status.textContent = 'Pendiente de la primera actualización';
  }
}

document.querySelectorAll('.webcam').forEach((video) => {
  const source = video.dataset.stream;
  if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = source;
  else if (window.Hls?.isSupported()) {
    const hls = new Hls({ lowLatencyMode: true });
    hls.loadSource(source);
    hls.attachMedia(video);
  }
});

loadStatus();
