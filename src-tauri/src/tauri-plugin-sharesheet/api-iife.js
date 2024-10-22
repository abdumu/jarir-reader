if ("__TAURI__" in window) {
    var __TAURI_PLUGIN_SHARESHEET__ = function (_) {
        "use strict";
        return "function" == typeof SuppressedError && SuppressedError, _.shareText = async function (_, e) {
            await async function (_, e = {}, r) {
                return window.__TAURI_INTERNALS__.invoke(_, e, r)
            }("plugin:sharesheet|share_text", {text: _, ...e})
        }, _.shareFile = async function (filePath, e) {
            await async function (filePath, e = {}, r) {
                return window.__TAURI_INTERNALS__.invoke(filePath, e, r)
            }("plugin:sharesheet|share_file", {filePath: filePath, ...e})
        }, _
    }({});
    Object.defineProperty(window.__TAURI__, "sharesheet", {value: __TAURI_PLUGIN_SHARESHEET__})
}