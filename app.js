const status = document.querySelector('#dashboard-updated');
const surfImage = document.querySelector('#surf-forecast-image');
const surfButtons = document.querySelectorAll('[data-surf-mode]');
let captureVersion = null;

function versionedUrl(path) {
  const url = new URL(path, window.location.href);
  if (captureVersion) url.searchParams.set('updated', captureVersion);
  return url.toString();
}

function setSurfForecast(mode) {
  if (!surfImage) return;
  const source = mode === 'sixDay' ? surfImage.dataset.sixDay : surfImage.dataset.hourly;
  surfImage.src = versionedUrl(source);
  surfImage.alt = mode === 'sixDay' ? 'Previsión de surf de 16 días de Zurriola' : 'Previsión horaria de surf de Zurriola';
  surfButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.surfMode === mode));
}

async function loadStatus() {
  try {
    const response = await fetch('assets/captures/status.json', { cache: 'no-store' });
    const { updatedAt } = await response.json();
    captureVersion = new Date(updatedAt).getTime();
    status.textContent = `Actualizado: ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))}`;
    document.querySelectorAll('.capture-card img').forEach((image) => {
      if (image !== surfImage) image.src = versionedUrl(image.getAttribute('src'));
    });
    setSurfForecast(document.querySelector('[data-surf-mode].is-active')?.dataset.surfMode ?? 'hourly');
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

surfButtons.forEach((button) => button.addEventListener('click', () => setSurfForecast(button.dataset.surfMode)));

loadStatus();
