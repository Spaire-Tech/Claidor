"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendClientBannerVersion = void 0;
const appendClientBannerVersion = (url, clientVersion) => {
    const parsed = new URL(url);
    parsed.searchParams.set('clientVersion', clientVersion);
    return parsed.toString();
};
exports.appendClientBannerVersion = appendClientBannerVersion;
//# sourceMappingURL=clientBannerRequest.js.map