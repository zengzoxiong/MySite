// Token 用量页「模型星云藏品柜」：零依赖 Canvas 2D 伪 3D 液态玻璃泡泡池
// 独立于页面筛选/趋势模块，仅读取 tokenUsage.days 展示用户使用过的全部模型
import { escapeHtml } from './common.js';

// 厂商配置：按模型 ID 小写前缀匹配，同时提供深色与浅色主题下的专属气泡色
const VENDORS = [
    { key: 'glm',      name: '智谱 GLM',   dark: '#7b8cff', light: '#4f62e8' },
    { key: 'mimo',     name: '小米 MiMo',  dark: '#ff9450', light: '#ea6a1e' },
    { key: 'deepseek', name: 'DeepSeek',   dark: '#3fb2ff', light: '#0284c7' },
    { key: 'gpt',      name: 'OpenAI GPT', dark: '#3ad6a0', light: '#059669' },
    { key: 'qwen',     name: '通义 Qwen',  dark: '#c08cff', light: '#7c3aed' },
    { key: 'other',    name: '其他',       dark: '#a3abba', light: '#64748b' }
];
const VENDOR_MAP = Object.fromEntries(VENDORS.map(v => [v.key, v]));

// 按模型名推断厂商键
function vendorKeyOf(id) {
    const low = (id || '').toLowerCase();
    for (const v of VENDORS) {
        if (v.key !== 'other' && low.startsWith(v.key)) return v.key;
    }
    return 'other';
}

// 确定性字符串哈希（FNV-1a），用于保证每次打开页面泡泡排布一致
function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
}

// 轻量可复现伪随机数生成器
function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// Token 数值紧凑格式化（亿 / 万 / 原数）
function fmtToken(n) {
    if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
    return Math.round(n).toLocaleString('zh-CN');
}

// 占比格式化（极小占比不显示 0.0%）
function fmtPct(p) {
    if (p <= 0) return '0%';
    if (p < 0.01) return '<0.01%';
    if (p < 0.1) return p.toFixed(2) + '%';
    return p.toFixed(1) + '%';
}

// 从 days 聚合全量模型统计，按累计 Token 降序排定 rank
function aggregateModels(days) {
    const map = new Map();
    let grandTotal = 0;
    for (const d of (days || [])) {
        const date = d.date || '';
        for (const m of (d.models || [])) {
            const total = Number(m.total) || 0;
            if (!m.id || total <= 0) continue;
            grandTotal += total;
            let rec = map.get(m.id);
            if (!rec) {
                rec = { id: m.id, vendor: vendorKeyOf(m.id), total: 0, daySet: new Set(), first: date, last: date };
                map.set(m.id, rec);
            }
            rec.total += total;
            if (date) {
                rec.daySet.add(date);
                if (!rec.first || date < rec.first) rec.first = date;
                if (!rec.last || date > rec.last) rec.last = date;
            }
        }
    }
    const list = [...map.values()].sort((a, b) => b.total - a.total);
    if (!list.length) return { models: [], grandTotal: 0 };

    // 对数尺度映射泡泡基准半径，兼顾 6 个数量级差异
    const logs = list.map(m => Math.log10(Math.max(100, m.total)));
    const minL = Math.min(...logs);
    const maxL = Math.max(...logs);
    const span = Math.max(0.001, maxL - minL);

    const models = list.map((m, idx) => ({
        id: m.id,
        vendor: m.vendor,
        total: m.total,
        days: m.daySet.size || 1,
        first: m.first,
        last: m.last,
        rank: idx + 1,
        pct: grandTotal > 0 ? (m.total / grandTotal) * 100 : 0,
        baseR: list.length === 1 ? 24 : 11 + 21 * ((logs[idx] - minL) / span)
    }));
    return { models, grandTotal };
}

// 为所有模型计算确定性三维星云坐标 + 同厂商最小生成树连线
function buildNebulaLayout(models) {
    const activeVendors = VENDORS.filter(v => models.some(m => m.vendor === v.key));
    const centers = {};
    const nV = activeVendors.length;
    // 各厂商簇心按黄金角分布于球面，兼顾上下层次与水平均衡
    activeVendors.forEach((v, i) => {
        const theta = (i / Math.max(1, nV)) * Math.PI * 2 + 0.35;
        const yNorm = nV <= 2 ? 0 : (((i % 2 === 0 ? 1 : -1) * 0.34) + (i / nV - 0.5) * 0.25);
        const r = 205;
        const horiz = Math.sqrt(Math.max(0.25, 1 - yNorm * yNorm)) * r;
        centers[v.key] = { x: Math.cos(theta) * horiz * 1.12, y: yNorm * r * 0.78, z: Math.sin(theta) * horiz };
    });

    // 为每个模型分配簇内初始坐标
    const nodes = models.map(m => {
        const c = centers[m.vendor] || { x: 0, y: 0, z: 0 };
        const rng = makeRng(hashStr(m.id));
        const u = rng() * Math.PI * 2;
        const w = Math.acos(2 * rng() - 1);
        const dist = 26 + rng() * 68;
        return {
            m,
            x: c.x + dist * Math.sin(w) * Math.cos(u),
            y: c.y + dist * Math.cos(w) * 0.85,
            z: c.z + dist * Math.sin(w) * Math.sin(u),
            phase: rng() * Math.PI * 2
        };
    });

    // 轻量三维排斥迭代，防止泡泡互相穿模重叠
    for (let iter = 0; iter < 30; iter++) {
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dz = b.z - a.z;
                const d = Math.hypot(dx, dy, dz) || 0.001;
                const minDist = (a.m.baseR + b.m.baseR) * 1.42 + 12;
                if (d < minDist) {
                    const push = (minDist - d) * 0.35 / d;
                    a.x -= dx * push; a.y -= dy * push; a.z -= dz * push;
                    b.x += dx * push; b.y += dy * push; b.z += dz * push;
                }
            }
        }
    }

    // 整体质心归零，让星云围绕画布中心平衡旋转
    if (nodes.length) {
        let sx = 0, sy = 0, sz = 0;
        for (const n of nodes) { sx += n.x; sy += n.y; sz += n.z; }
        sx /= nodes.length; sy /= nodes.length; sz /= nodes.length;
        for (const n of nodes) { n.x -= sx; n.y -= sy; n.z -= sz; }
    }

    // 重算每个厂商的实际簇心（用于点击厂商胶囊时平滑转向）
    const vendorCenters = {};
    for (const v of activeVendors) {
        const group = nodes.filter(n => n.m.vendor === v.key);
        let cx = 0, cy = 0, cz = 0;
        for (const n of group) { cx += n.x; cy += n.y; cz += n.z; }
        vendorCenters[v.key] = { x: cx / group.length, y: cy / group.length, z: cz / group.length };
    }

    // 同厂商最小生成树连线（Prim），形成克制干净的星座骨架
    const edges = [];
    for (const v of activeVendors) {
        const group = nodes.filter(n => n.m.vendor === v.key);
        if (group.length < 2) continue;
        const used = new Set([0]);
        while (used.size < group.length) {
            let bestA = -1, bestB = -1, bestD = Infinity;
            for (const i of used) {
                for (let j = 0; j < group.length; j++) {
                    if (used.has(j)) continue;
                    const a = group[i], b = group[j];
                    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
                    if (d < bestD) { bestD = d; bestA = i; bestB = j; }
                }
            }
            if (bestB < 0) break;
            used.add(bestB);
            edges.push({ a: group[bestA], b: group[bestB], vendor: v.key });
        }
    }

    return { nodes, edges, activeVendors, vendorCenters };
}

// 十六进制颜色转 rgba
function hexAlpha(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// 计算将某个 3D 目标点转到镜头正前方所需的 yaw / pitch
function anglesForPoint(pt) {
    const len = Math.hypot(pt.x, pt.y, pt.z) || 1;
    // 投影公式为 X = x*cos(y) - z*sin(y), Z = x*sin(y) + z*cos(y)
    // 让目标转到 z 轴负方向（最靠近相机，Z 最小）：atan2(-x, -z)
    const yaw = Math.atan2(pt.x, -pt.z);
    const horiz = Math.hypot(pt.x, pt.z) || 1;
    const pitch = Math.max(-0.85, Math.min(0.85, Math.atan2(pt.y, horiz) * 0.72));
    return { yaw, pitch, len };
}

// 最短角度差（避免旋转绕远圈）
function shortestAngleDelta(from, to) {
    let diff = (to - from) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
}

/**
 * 挂载模型星云藏品柜到指定容器
 * @param {HTMLElement} container 容器元素
 * @param {Array} days tokenUsage.days 数据数组
 * @param {Object|null} savedState 可选，重渲染时恢复的视角/选中状态
 * @returns {{ destroy: Function, getState: Function, count: number }}
 */
export function mountTokenNebula(container, days, savedState = null) {
    const { models } = aggregateModels(days);
    if (!models.length) {
        container.innerHTML = '<div class="fx-placeholder">暂无模型用量数据</div>';
        return { destroy() {}, getState() { return null; }, count: 0 };
    }

    const { nodes, edges, activeVendors, vendorCenters } = buildNebulaLayout(models);

    // 渲染骨架 DOM：画布 + 右上角控制钮 + 右侧精简铭牌 + 底部厂商聚焦胶囊
    container.innerHTML = `
        <div class="tu-nebula-stage">
            <canvas class="tu-nebula-canvas" aria-label="模型星云藏品柜，拖拽可旋转，点击泡泡查看模型信息"></canvas>
            <div class="tu-nebula-ctrls" role="group" aria-label="星云视角控制">
                <button class="tu-nebula-ctrl" type="button" data-act="in" title="放大" aria-label="放大">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>
                </button>
                <button class="tu-nebula-ctrl" type="button" data-act="out" title="缩小" aria-label="缩小">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.5 8h9"/></svg>
                </button>
                <button class="tu-nebula-ctrl" type="button" data-act="reset" title="复位视角" aria-label="复位视角">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a5 5 0 1 0 1.4-3.5L3 6"/><path d="M3 3v3h3"/></svg>
                </button>
            </div>
            <aside class="tu-nebula-card" aria-live="polite" hidden></aside>
            <div class="tu-nebula-hint">拖拽旋转 · 点击泡泡查看</div>
        </div>
        <div class="tu-nebula-vendors" role="group" aria-label="按厂商聚焦">
            ${activeVendors.map(v => {
                const cnt = models.filter(m => m.vendor === v.key).length;
                return `<button class="tu-nebula-chip" type="button" data-vendor="${v.key}" style="--vc-dark:${v.dark};--vc-light:${v.light}"><i class="tu-nebula-dot"></i><span>${escapeHtml(v.name)}</span><em>${cnt}</em></button>`;
            }).join('')}
        </div>
    `;

    const stage = container.querySelector('.tu-nebula-stage');
    const canvas = container.querySelector('.tu-nebula-canvas');
    const ctx = canvas.getContext('2d');
    const cardEl = container.querySelector('.tu-nebula-card');
    const chips = [...container.querySelectorAll('.tu-nebula-chip')];

    // 状态（可从 savedState 恢复）
    const st = {
        yaw: savedState ? savedState.yaw : 0.35,
        pitch: savedState ? savedState.pitch : -0.22,
        zoom: savedState ? savedState.zoom : 1,
        targetYaw: savedState ? savedState.yaw : 0.35,
        targetPitch: savedState ? savedState.pitch : -0.22,
        targetZoom: savedState ? savedState.zoom : 1,
        shiftX: 0,
        targetShiftX: 0,
        velYaw: 0,
        velPitch: 0,
        focusVendor: savedState ? savedState.focusVendor : null,
        selectedId: savedState ? savedState.selectedId : null,
        hoverId: null,
        pointerIn: false,
        dragging: false,
        camAnimating: false
    };

    let width = 0;
    let height = 0;
    let drawn = []; // 按绘制顺序（从远到近）记录屏幕坐标，供精准命中检测
    let rafId = 0;
    let destroyed = false;
    let lastTime = performance.now();
    const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

    function isReducedMotion() {
        return document.body.classList.contains('no-anim') || reducedMotionMq.matches;
    }

    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function vendorColor(key, dark) {
        const v = VENDOR_MAP[key] || VENDOR_MAP.other;
        return dark ? v.dark : v.light;
    }

    function resize() {
        if (destroyed) return;
        const rect = stage.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = Math.max(260, Math.floor(rect.width));
        height = Math.max(300, Math.floor(rect.height));
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        updateShiftTarget();
        if (isReducedMotion()) renderFrame(performance.now());
    }

    // 桌面端展开右侧铭牌时，将星云视角平滑偏左，避免被铭牌遮挡
    function updateShiftTarget() {
        st.targetShiftX = (st.selectedId && width > 680) ? -Math.min(115, width * 0.13) : 0;
    }

    // 投影单个三维点到画布平面
    function project(x, y, z) {
        const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
        const cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
        const x1 = x * cy - z * sy;
        const z1 = x * sy + z * cy;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const focal = Math.min(width, height) * 1.25 * st.zoom;
        const camDist = 660;
        const depth = z2 + camDist;
        const k = focal / Math.max(80, depth);
        return {
            x: width / 2 + st.shiftX + x1 * k,
            y: height / 2 + y2 * k,
            k,
            z: depth
        };
    }

    // 绘制单个液态玻璃泡泡
    function drawGlassBubble(x, y, r, color, alpha, isHot, isDim, dark) {
        ctx.save();
        ctx.globalAlpha = alpha;

        // 悬停或选中时的柔和外辉光
        if (isHot) {
            const glow = ctx.createRadialGradient(x, y, r * 0.65, x, y, r * 1.65);
            glow.addColorStop(0, hexAlpha(color, dark ? 0.36 : 0.28));
            glow.addColorStop(1, hexAlpha(color, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, r * 1.65, 0, Math.PI * 2);
            ctx.fill();
        }

        // 1. 半透明液态玻璃球体基底
        const bodyGrad = ctx.createRadialGradient(
            x - r * 0.34, y - r * 0.38, r * 0.06,
            x, y, r
        );
        if (dark) {
            bodyGrad.addColorStop(0, 'rgba(255,255,255,0.82)');
            bodyGrad.addColorStop(0.24, hexAlpha(color, 0.72));
            bodyGrad.addColorStop(0.74, hexAlpha(color, 0.28));
            bodyGrad.addColorStop(1, hexAlpha(color, 0.14));
        } else {
            bodyGrad.addColorStop(0, 'rgba(255,255,255,0.96)');
            bodyGrad.addColorStop(0.28, hexAlpha(color, 0.56));
            bodyGrad.addColorStop(0.78, hexAlpha(color, 0.34));
            bodyGrad.addColorStop(1, hexAlpha(color, 0.50));
        }
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // 2. 边缘淡虹彩玻璃描边
        const rimGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        rimGrad.addColorStop(0, dark ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.95)');
        rimGrad.addColorStop(0.45, hexAlpha(color, isHot ? 0.95 : (dark ? 0.65 : 0.75)));
        rimGrad.addColorStop(0.8, dark ? 'rgba(186,230,253,0.52)' : 'rgba(147,197,253,0.68)');
        rimGrad.addColorStop(1, dark ? 'rgba(244,180,255,0.45)' : 'rgba(216,180,254,0.58)');
        ctx.lineWidth = isHot ? 2 : (isDim ? 0.8 : 1.15);
        ctx.strokeStyle = isHot ? (dark ? '#ffffff' : hexAlpha(color, 0.98)) : rimGrad;
        ctx.stroke();

        // 3. 左上主高光椭圆
        ctx.beginPath();
        ctx.ellipse(x - r * 0.31, y - r * 0.38, r * 0.29, r * 0.15, -0.52, 0, Math.PI * 2);
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.82)';
        ctx.fill();

        // 4. 右下角柔和内反射月牙弧（玻璃折射感）
        if (r > 9) {
            ctx.beginPath();
            ctx.arc(x, y, r * 0.76, 0.25, 1.35);
            ctx.lineWidth = Math.max(1, r * 0.08);
            ctx.lineCap = 'round';
            ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.62)';
            ctx.stroke();
        }

        ctx.restore();
    }

    // 绘制模型名标签
    function drawLabel(text, x, y, alpha, isHot, dark) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = (isHot ? '600 12px ' : '500 11px ') + 'var(--font-ui, system-ui, sans-serif)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // 轻微描边衬底，保证穿过连线或浅色底时依然清晰
        ctx.lineWidth = 3;
        ctx.strokeStyle = dark ? 'rgba(10,12,18,0.72)' : 'rgba(242,246,252,0.86)';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = isHot
            ? (dark ? '#ffffff' : '#0f172a')
            : (dark ? 'rgba(226,232,240,0.88)' : 'rgba(30,41,59,0.85)');
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    // 同步右侧精简铭牌 DOM
    function syncCard() {
        const m = st.selectedId ? models.find(item => item.id === st.selectedId) : null;
        if (!m) {
            cardEl.hidden = true;
            cardEl.classList.remove('is-open');
            return;
        }
        const v = VENDOR_MAP[m.vendor] || VENDOR_MAP.other;
        const dateRange = m.first === m.last ? m.first : `${m.first} — ${m.last}`;
        cardEl.innerHTML = `
            <div class="tu-nc-head">
                <div class="tu-nc-title">${escapeHtml(m.id)}</div>
                <button class="tu-nc-close" type="button" aria-label="关闭铭牌" title="关闭">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                </button>
            </div>
            <div class="tu-nc-meta">
                <span class="tu-nc-vendor" style="--vc-dark:${v.dark};--vc-light:${v.light}"><i class="tu-nebula-dot"></i>${escapeHtml(v.name)}</span>
                <span class="tu-nc-rank">#${m.rank}</span>
            </div>
            <div class="tu-nc-grid">
                <div class="tu-nc-row">
                    <span>累计 Token</span>
                    <strong>${fmtToken(m.total)}<em>${fmtPct(m.pct)}</em></strong>
                </div>
                <div class="tu-nc-row">
                    <span>活跃天数</span>
                    <strong>${m.days} 天</strong>
                </div>
                <div class="tu-nc-row">
                    <span>使用日期</span>
                    <strong class="tu-nc-dates">${escapeHtml(dateRange)}</strong>
                </div>
            </div>
        `;
        cardEl.hidden = false;
        // 触发过渡类
        requestAnimationFrame(() => { if (!destroyed && st.selectedId === m.id) cardEl.classList.add('is-open'); });
    }

    // 同步底部厂商聚焦胶囊高亮态
    function syncChips() {
        for (const c of chips) {
            const active = c.dataset.vendor === st.focusVendor;
            c.classList.toggle('active', active);
            c.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }

    // 镜头平滑转向指定三维点
    function focusPoint(pt) {
        const { yaw, pitch } = anglesForPoint(pt);
        st.targetYaw = st.yaw + shortestAngleDelta(st.yaw, yaw);
        st.targetPitch = pitch;
        st.velYaw = 0;
        st.velPitch = 0;
        st.camAnimating = true;
    }

    // 主绘制帧
    function renderFrame(now) {
        if (destroyed) return;
        // 双重保险：容器脱离文档后自动终止动画循环
        if (!container.isConnected) {
            destroy();
            return;
        }

        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        const reduced = isReducedMotion();
        const dark = isDarkTheme();

        // 更新镜头姿态
        if (!st.dragging) {
            if (st.camAnimating) {
                const ease = reduced ? 1 : 1 - Math.pow(0.0015, dt);
                st.yaw += (st.targetYaw - st.yaw) * ease;
                st.pitch += (st.targetPitch - st.pitch) * ease;
                if (Math.abs(st.targetYaw - st.yaw) < 0.002 && Math.abs(st.targetPitch - st.pitch) < 0.002) {
                    st.yaw = st.targetYaw;
                    st.pitch = st.targetPitch;
                    st.camAnimating = false;
                }
            } else {
                // 惯性阻尼
                if (Math.abs(st.velYaw) > 0.0001 || Math.abs(st.velPitch) > 0.0001) {
                    st.yaw += st.velYaw * dt * 60;
                    st.pitch = Math.max(-1.15, Math.min(1.15, st.pitch + st.velPitch * dt * 60));
                    const damp = Math.pow(0.9, dt * 60);
                    st.velYaw *= damp;
                    st.velPitch *= damp;
                } else if (!reduced && !st.selectedId && !st.focusVendor) {
                    // 平时缓慢自转，悬停画布时平滑减速
                    const speed = st.pointerIn ? 0.055 : 0.22;
                    st.yaw += speed * dt;
                }
                st.targetYaw = st.yaw;
                st.targetPitch = st.pitch;
            }
        }

        // 缩放与中心偏移平滑缓动
        const kEase = reduced ? 1 : 1 - Math.pow(0.001, dt);
        st.zoom += (st.targetZoom - st.zoom) * kEase;
        st.shiftX += (st.targetShiftX - st.shiftX) * kEase;

        ctx.clearRect(0, 0, width, height);

        // 投影全部节点（带极轻上下漂浮）
        const floatAmp = reduced ? 0 : 3.2;
        const projMap = new Map();
        const projected = nodes.map(n => {
            const fy = floatAmp ? Math.sin(now * 0.0011 + n.phase) * floatAmp : 0;
            const p = project(n.x, n.y + fy, n.z);
            const item = { n, p };
            projMap.set(n, item);
            return item;
        }).filter(item => item.p.z > 80);

        // 先画同厂商星座微光线
        for (const edge of edges) {
            const pa = projMap.get(edge.a);
            const pb = projMap.get(edge.b);
            if (!pa || !pb) continue;
            const avgZ = (pa.p.z + pb.p.z) * 0.5;
            const depthFade = Math.max(0.12, Math.min(1, 1.35 - (avgZ - 420) / 520));
            const isFocus = st.focusVendor && edge.vendor === st.focusVendor;
            const isMuted = (st.focusVendor && edge.vendor !== st.focusVendor) ||
                (st.selectedId && edge.a.m.id !== st.selectedId && edge.b.m.id !== st.selectedId);
            const col = vendorColor(edge.vendor, dark);
            const baseA = dark ? 0.24 : 0.28;
            const lineAlpha = depthFade * (isFocus ? baseA * 2.1 : (isMuted ? baseA * 0.28 : baseA));
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(pa.p.x, pa.p.y);
            ctx.lineTo(pb.p.x, pb.p.y);
            ctx.strokeStyle = hexAlpha(col, Math.min(0.75, lineAlpha));
            ctx.lineWidth = isFocus ? 1.2 : 0.85;
            ctx.stroke();
            ctx.restore();
        }

        // 按深度从远到近排序绘制泡泡
        projected.sort((a, b) => b.p.z - a.p.z);
        drawn = [];

        for (const { n, p } of projected) {
            const m = n.m;
            const r = Math.max(5.5, Math.min(54, m.baseR * p.k));
            const depthAlpha = Math.max(0.24, Math.min(1, 1.32 - (p.z - 420) / 520));
            const isSel = m.id === st.selectedId;
            const isHover = m.id === st.hoverId;
            const isHot = isSel || isHover;
            const inFocus = !st.focusVendor || m.vendor === st.focusVendor;
            const isDim = (!inFocus) || (st.selectedId && !isSel);
            const alpha = isHot ? 1 : depthAlpha * (isDim ? 0.28 : 0.96);
            const col = vendorColor(m.vendor, dark);

            drawGlassBubble(p.x, p.y, r, col, alpha, isHot, isDim, dark);

            // 标签：选中具体泡泡时仅显当前与悬停标签，未选中时显前景大泡泡或聚焦厂商标签
            const showLabel = isHot || (!st.selectedId && ((inFocus && r > 18) || (st.focusVendor && inFocus && r > 10)));
            if (showLabel) {
                const labelAlpha = isHot ? 1 : Math.min(0.92, depthAlpha * 0.95);
                drawLabel(m.id, p.x, p.y + r + 6, labelAlpha, isHot, dark);
            }

            drawn.push({ m, n, x: p.x, y: p.y, r: Math.max(r + 3, 12) });
        }

        if (!reduced) {
            rafId = requestAnimationFrame(renderFrame);
        } else {
            rafId = 0;
        }
    }

    function requestRedraw() {
        if (destroyed) return;
        if (isReducedMotion()) {
            renderFrame(performance.now());
        } else if (!rafId) {
            lastTime = performance.now();
            rafId = requestAnimationFrame(renderFrame);
        }
    }

    // 命中检测（从最前景泡泡往前找）
    function hitTest(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;
        for (let i = drawn.length - 1; i >= 0; i--) {
            const d = drawn[i];
            const dx = mx - d.x;
            const dy = my - d.y;
            if (dx * dx + dy * dy <= d.r * d.r) return d;
        }
        return null;
    }

    // 指针拖拽与点击事件
    let downInfo = null;
    let moved = false;

    function onPointerDown(e) {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        downInfo = {
            x: e.clientX, y: e.clientY,
            lastX: e.clientX, lastY: e.clientY,
            yaw: st.yaw, pitch: st.pitch
        };
        moved = false;
        st.camAnimating = false;
        st.velYaw = 0;
        st.velPitch = 0;
        canvas.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
        if (downInfo) {
            const dx = e.clientX - downInfo.x;
            const dy = e.clientY - downInfo.y;
            if (!moved && Math.hypot(dx, dy) > 5) {
                moved = true;
                st.dragging = true;
                canvas.classList.add('is-dragging');
            }
            if (moved) {
                const stepX = e.clientX - downInfo.lastX;
                const stepY = e.clientY - downInfo.lastY;
                st.yaw = downInfo.yaw + dx * 0.0065;
                st.pitch = Math.max(-1.15, Math.min(1.15, downInfo.pitch + dy * 0.0055));
                st.velYaw = stepX * 0.0038;
                st.velPitch = stepY * 0.0032;
                downInfo.lastX = e.clientX;
                downInfo.lastY = e.clientY;
                requestRedraw();
            }
            return;
        }
        const hit = hitTest(e.clientX, e.clientY);
        const nextHover = hit ? hit.m.id : null;
        if (nextHover !== st.hoverId) {
            st.hoverId = nextHover;
            canvas.style.cursor = nextHover ? 'pointer' : '';
            requestRedraw();
        }
    }

    function onPointerUp(e) {
        if (!downInfo) return;
        if (canvas.hasPointerCapture(e.pointerId)) {
            canvas.releasePointerCapture(e.pointerId);
        }
        const wasMoved = moved;
        downInfo = null;
        st.dragging = false;
        canvas.classList.remove('is-dragging');

        if (!wasMoved) {
            const hit = hitTest(e.clientX, e.clientY);
            if (hit) {
                st.selectedId = hit.m.id;
                updateShiftTarget();
                focusPoint(hit.n);
                syncCard();
            } else if (st.selectedId) {
                st.selectedId = null;
                updateShiftTarget();
                syncCard();
            }
            requestRedraw();
        }
    }

    function onPointerEnter() { st.pointerIn = true; }
    function onPointerLeave() {
        st.pointerIn = false;
        if (st.hoverId) {
            st.hoverId = null;
            canvas.style.cursor = '';
            requestRedraw();
        }
    }

    // 角落控制按钮：缩放 / 复位
    function onCtrlClick(e) {
        const btn = e.target.closest('.tu-nebula-ctrl');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'in') {
            st.targetZoom = Math.min(1.65, st.targetZoom * 1.18);
        } else if (act === 'out') {
            st.targetZoom = Math.max(0.68, st.targetZoom / 1.18);
        } else if (act === 'reset') {
            st.focusVendor = null;
            st.selectedId = null;
            st.targetZoom = 1;
            st.targetYaw = st.yaw + shortestAngleDelta(st.yaw, 0.35);
            st.targetPitch = -0.22;
            st.camAnimating = true;
            updateShiftTarget();
            syncChips();
            syncCard();
        }
        requestRedraw();
    }

    // 底部厂商聚焦胶囊点击
    function onVendorClick(e) {
        const chip = e.target.closest('.tu-nebula-chip');
        if (!chip) return;
        const key = chip.dataset.vendor;
        if (st.focusVendor === key) {
            st.focusVendor = null;
        } else {
            st.focusVendor = key;
            const center = vendorCenters[key];
            if (center) focusPoint(center);
        }
        syncChips();
        requestRedraw();
    }

    // 铭牌关闭按钮
    function onCardClick(e) {
        if (e.target.closest('.tu-nc-close')) {
            st.selectedId = null;
            updateShiftTarget();
            syncCard();
            requestRedraw();
        }
    }

    // Esc 收起铭牌
    function onKeyDown(e) {
        if (e.key === 'Escape' && st.selectedId) {
            st.selectedId = null;
            updateShiftTarget();
            syncCard();
            requestRedraw();
        }
    }

    // 监听主题切换与减少动画类变化，即时重绘
    const themeObs = new MutationObserver(() => requestRedraw());
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    themeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const resizeObs = new ResizeObserver(() => resize());
    resizeObs.observe(stage);

    const ctrlsEl = container.querySelector('.tu-nebula-ctrls');
    const vendorsEl = container.querySelector('.tu-nebula-vendors');

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerenter', onPointerEnter);
    canvas.addEventListener('pointerleave', onPointerLeave);
    ctrlsEl.addEventListener('click', onCtrlClick);
    vendorsEl.addEventListener('click', onVendorClick);
    cardEl.addEventListener('click', onCardClick);
    document.addEventListener('keydown', onKeyDown);

    // 初始挂载
    resize();
    syncChips();
    syncCard();
    requestRedraw();

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        if (rafId) cancelAnimationFrame(rafId);
        themeObs.disconnect();
        resizeObs.disconnect();
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('pointerenter', onPointerEnter);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        ctrlsEl.removeEventListener('click', onCtrlClick);
        vendorsEl.removeEventListener('click', onVendorClick);
        cardEl.removeEventListener('click', onCardClick);
        document.removeEventListener('keydown', onKeyDown);
    }

    function getState() {
        return {
            yaw: st.yaw,
            pitch: st.pitch,
            zoom: st.targetZoom,
            focusVendor: st.focusVendor,
            selectedId: st.selectedId
        };
    }

    return { destroy, getState, count: models.length };
}
