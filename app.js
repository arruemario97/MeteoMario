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
  surfImage.alt = mode === 'sixDay' ? 'Zurriolako 16 eguneko surf-iragarpena' : 'Zurriolako orduz orduko surf-iragarpena';
  surfButtons.forEach((button) => {
    const active = button.dataset.surfMode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

async function loadStatus() {
  try {
    const response = await fetch('assets/captures/status.json', { cache: 'no-store' });
    const { updatedAt } = await response.json();
    const date = new Date(updatedAt);
    if (!response.ok || !updatedAt || !Number.isFinite(date.getTime())) throw new Error();
    captureVersion = date.getTime();
    const formatted = new Intl.DateTimeFormat('eu-ES', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid',
    }).format(date);
    status.textContent = `Azken eguneratzea: ${formatted}`;
    document.querySelectorAll('.capture-card img').forEach((image) => {
      if (image !== surfImage) image.src = versionedUrl(image.getAttribute('src'));
    });
    setSurfForecast(document.querySelector('[data-surf-mode].is-active')?.dataset.surfMode ?? 'hourly');
  } catch {
    status.textContent = 'Lehen eguneratzearen zain';
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
