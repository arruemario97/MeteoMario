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

function playWebcam(video) {
  video.play().catch(() => {});
}

function initialiseWebcam(video) {
  const source = video.dataset.stream;
  video.addEventListener('canplay', () => playWebcam(video));

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = source;
    video.load();
    playWebcam(video);
  } else if (window.Hls?.isSupported()) {
    const hls = new Hls({ lowLatencyMode: true });
    hls.loadSource(source);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => playWebcam(video));
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else {
        hls.destroy();
        setTimeout(() => initialiseWebcam(video), 2_000);
      }
    });
  }
}

document.querySelectorAll('.webcam').forEach(initialiseWebcam);

surfButtons.forEach((button) => button.addEventListener('click', () => setSurfForecast(button.dataset.surfMode)));

loadStatus();
