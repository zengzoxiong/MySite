// 共享基础设施：js/ 子模块与主 script.js 共用的最小工具集（渐进式模块化试点）。
// 约定：js/ 子模块从主 script.js 循环导入的绑定（ESM live binding）只允许在
// 函数体内访问，禁止在模块顶层读取——script.js 的函数声明在实例化期就绪，
// let/const 变量要等主模块主体执行完才有值。

// 初始化单步容错：SWR 缓存优先模式下，老访客可能短暂持有新旧错配的资源
// （旧 index.html/appearance.js + 新 script.js），某一步可能因元素/函数缺失抛异常，
// 不能让它把后面的初始化全部拦腰截断（否则时钟/天气/播放器/仪表盘整片挂掉）
export function safeInit(name, fn) {
    try { fn(); } catch (e) { console.error('[拾光集] 初始化失败:', name, e); }
}

// 隐私模式/站点数据被禁时 localStorage 读写会直接抛异常，统一走安全通道
export function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
export function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 存不上就算了 */ }
}

// 卡片构建器共用转义（收藏/工具/影视/搜索等处复用）
export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 弹层清单单一来源：全局 ESC 兜底判断「有没有弹层开着」用（settings/cmdk/talisman/ghPanel
// 各自的关闭监听会先一步处理；这里只负责「全没开时 ESC 回首页」的兜底）
export const OVERLAY_IDS = ['settingsModal', 'talismanModal', 'cmdk', 'ghPanel'];
