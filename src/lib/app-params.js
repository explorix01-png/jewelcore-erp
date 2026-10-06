const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const storage = windowObj.localStorage;

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
};

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `jewelcore_${toSnakeCase(paramName)}`;
	const legacyKey = `base44_${toSnakeCase(paramName)}`;

	// Automatic self-healing: purge any stale recursive or corrupted values from storage
	try {
		for (const key of [storageKey, legacyKey]) {
			const existing = storage.getItem(key);
			if (existing && (typeof existing !== 'string' || existing.length > 500 || existing.includes('returnTo='))) {
				storage.removeItem(key);
			}
		}
	} catch {}

	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam && typeof searchParam === 'string' && searchParam.length < 500) {
		storage.setItem(storageKey, searchParam);
		return searchParam;
	}
	const storedValue = storage.getItem(storageKey) || storage.getItem(legacyKey);
	if (storedValue && typeof storedValue === 'string' && storedValue.length < 500) {
		return storedValue;
	}
	if (defaultValue !== undefined) {
		return defaultValue;
	}
	return null;
};

const getAppParams = () => {
	if (getAppParamValue("clear_access_token") === 'true') {
		storage.removeItem('token');
		storage.removeItem('base44_access_token');
		storage.removeItem('jewelcore_access_token');
	}
	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_APP_ID || import.meta.env.VITE_BASE44_APP_ID || 'jewelcore' }),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: "/" }),
		functionsVersion: getAppParamValue("functions_version", { defaultValue: import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_BASE44_FUNCTIONS_VERSION || '1.0.0' }),
		appBaseUrl: getAppParamValue("app_base_url", { defaultValue: import.meta.env.VITE_APP_BASE_URL || import.meta.env.VITE_BASE44_APP_BASE_URL || '' }),
	};
};

export const appParams = {
	...getAppParams()
};
