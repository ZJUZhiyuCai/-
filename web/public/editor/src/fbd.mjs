// SPDX-License-Identifier: MIT
// Independently written, deliberately partial BD/FBD text importer.
// Evidence and limits: ../docs/fbd-support.md. Input must already be decoded.
const FONTS = { SS: "serif", H: "sans", K: "kai" };
// Conventional Chinese type sizes, in points; not recovered engine metrics.
const SIZES = { 1: 26, 2: 22, 3: 16, 4: 14, 5: 10.5, 6: 7.5, 7: 5.5, 8: 5 };
const CLOSE = { "[": "]", "〖": "〗", "〚": "〛" };

export function parseFbd(input) {
  if (typeof input !== "string")
    throw new TypeError("parseFbd expects decoded text");
  const blocks = [];
  const warnings = new Set();
  let text = "",
    style = {},
    baseStyle = {},
    marks = [],
    type = "paragraph",
    level,
    indentState = {},
    paragraphIndent = {},
    align = "left",
    ended = false;
  const warn = (message) => warnings.add(message);
  const flush = () => {
    if (text.length)
      blocks.push({
        id: `fbd-${blocks.length + 1}`,
        type,
        text,
        align,
        ...baseStyle,
        ...paragraphIndent,
        ...(type === "heading" ? { level } : {}),
        ...(marks.length ? { marks } : {}),
      });
    text = "";
    marks = [];
    baseStyle = { ...style };
    align = "left";
  };
  const append = (value) => {
    if (!text.length) { baseStyle = { ...style }; paragraphIndent = { ...indentState }; }
    const start = text.length;
    text += value;
    if (style.fontFamily !== baseStyle.fontFamily || style.fontSize !== baseStyle.fontSize) {
      const previous = marks.at(-1);
      if (previous?.end === start && previous.fontFamily === style.fontFamily && previous.fontSize === style.fontSize) previous.end = text.length;
      else marks.push({ start, end: text.length, ...style });
    }
  };
  // Physical newlines are source formatting, not BD paragraph delimiters.
  let source = input.replace(/^\uFEFF/, "").replace(/\r\n?|\n/g, "");
  let layout;
  // Only a single whole-document region can be represented by global columns.
  for (const [open, close] of Object.entries(CLOSE)) {
    for (const columns of [1, 2, 3, 4]) {
      const prefix = `${open}FL(${columns}${close}`, suffix = `${open}FL)${close}`;
      const body = source.replace(/\uE005+$/, "");
      if (body.startsWith(prefix) && body.endsWith(suffix)) {
        const inner = body.slice(prefix.length, -suffix.length);
        if (!/[\[〖〚]FL/.test(inner)) {
          source = inner + source.slice(body.length);
          layout = { columns };
          warn("整篇 FL 分栏按全局栏数导入；未还原原引擎栏底拉平。");
        }
      }
    }
  }
  if (/^\d{7}/.test(source))
    warn("开头七位数字可能为文件元数据；含义未确认，已保留。");
  for (let i = 0; i < source.length;) {
    const char = source[i];
    if (char === "\uE005") {
      ended = true;
      i++;
      continue;
    }
    if (ended) warn("结束符后仍有内容；为避免丢失，已继续保留。");
    if (char === "\uE004") {
      flush();
      i++;
      continue;
    }
    if (char === "\uE003") {
      append("\n");
      i++;
      continue;
    }
    if (char === "〓") {
      append("\u3000");
      i++;
      continue;
    }
    if (CLOSE[char]) {
      const end = source.indexOf(CLOSE[char], i + 1);
      if (end === -1) {
        warn("存在未闭合注解，原文已保留。");
        append(source.slice(i));
        break;
      }
      const raw = source.slice(i, end + 1);
      const body = source.slice(i + 1, end).replace(/\s+/g, "");
      let consumed = false;
      if (!text.length && (body === "JZ" || body === "JY")) {
        align = body === "JZ" ? "center" : "right";
        consumed = true;
        warn("JZ/JY 按当前段落对齐近似导入；未实现原引擎逐行定位。");
      } else if (body.startsWith("HT")) {
        const match = /^HT(?:(\d+\.(?:25|50|75)?|[1-8]))?(SS|H|K)?$/.exec(body);
        if (match && (match[1] || match[2])) {
          const size = match[1]
            ? match[1].includes(".")
              ? Number(match[1])
              : SIZES[match[1]]
            : undefined;
          if (size === undefined || (size >= 5 && size <= 72)) {
            if (size !== undefined) style.fontSize = size;
            if (match[2]) style.fontFamily = FONTS[match[2]];
            consumed = true;
            warn("HT 使用本工具字体与常用字号近似映射，非方正字库或排版度量。");
          }
        }
      } else if (body.startsWith("SJ")) {
        const fixed = /^SJ(\d+\.(?:25|50|75)?|[1-8])(?:。([1-9]|10))?$/.exec(body);
        const distance = /^SJJ(\d+(?:\.\d+)?)(mm|p)?$/.exec(body);
        let next;
        if (body === "SJ") next = { indent: 2 };
        else if (fixed) {
          const points = fixed[1].includes(".") ? Number(fixed[1]) : SIZES[fixed[1]];
          const indentPt = points * Number(fixed[2] || 2);
          if (points >= 5 && points <= 72 && indentPt <= 144) next = { indentPt };
        } else if (distance) {
          const n = Number(distance[1]);
          if (!distance[2] && n <= 20) next = { indent: n };
          else if (distance[2]) {
            const indentPt = n * (distance[2] === 'mm' ? 72 / 25.4 : 1);
            if (indentPt <= 144) next = { indentPt };
          }
        }
        if (next) { indentState = next; consumed = true; }
      } else if (/^BT\([1-4]$/.test(body) && type === "paragraph") {
        const remainder = source.slice(end + 1);
        const closing = /[\[〖〚]BT\)[\]〗〛]/.exec(remainder);
        // Nested or unclosed title structures remain visible in source form.
        if (closing && !/[\[〖〚]BT/.test(remainder.slice(0, closing.index))) {
          flush(); type = "heading"; level = Number(body.slice(-1)); consumed = true;
          warn(`BT ${body.slice(-1)} 级标题仅导入标题结构；PRO 标题定义、行数及孤题规则未还原。`);
        }
      } else if (body === "BT)" && type === "heading") {
        flush(); type = "paragraph"; consumed = true;
      }
      if (!consumed) {
        append(raw);
        warn(`未支持或无法无损表示的注解已保留：${raw}`);
      }
      i = end + 1;
      continue;
    }
    if (char === "\\" && /[=;]/.test(source[i + 1] || ""))
      warn("反斜杠控制序列尚未确认，已保留原文。");
    if (char.charCodeAt(0) >= 0xe000 && char.charCodeAt(0) <= 0xf8ff)
      warn(
        `未知私用区字符 U+${char.charCodeAt(0).toString(16).toUpperCase()} 已保留。`,
      );
    append(char);
    i++;
  }
  flush();
  if (!ended) warn("未发现 U+E005 文件结束符；已按文本末尾结束导入。");
  return { blocks, warnings: [...warnings], ...(layout ? { layout } : {}) };
}
