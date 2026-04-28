const API_BASE = 'https://codeforces.com/api';
const CACHE_KEY = 'cf_problemset_cache_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const getJson = async (url) => {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.status !== 'OK') {
    throw new Error(data.comment || 'Codeforces API request failed');
  }

  return data.result;
};

export const fetchUserInfo = (handle) => getJson(`${API_BASE}/user.info?handles=${handle}`);

export const fetchUserStatus = (handle) => getJson(`${API_BASE}/user.status?handle=${handle}`);

export const fetchUserRating = (handle) => getJson(`${API_BASE}/user.rating?handle=${handle}`);

const readProblemsetCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
};

const writeProblemsetCache = (data) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ cachedAt: Date.now(), data })
    );
  } catch {
    // Ignore cache write errors (private mode / quota exceeded).
  }
};

export const fetchProblemsetWithCache = async () => {
  const cached = readProblemsetCache();
  if (cached) {
    return cached;
  }

  const result = await getJson(`${API_BASE}/problemset.problems`);

  const slimProblems = result.problems.map((problem) => ({
    contestId: problem.contestId,
    index: problem.index,
    name: problem.name,
    rating: problem.rating || null,
    tags: problem.tags || []
  }));

  writeProblemsetCache(slimProblems);
  return slimProblems;
};
