// SPDX-License-Identifier: MIT
import test from "node:test";
import assert from "node:assert/strict";
import { parseFbd } from "../public/editor/src/fbd.mjs";

test("prefix styles, paragraph markers and persistent font state", () => {
  const result = parseFbd("[HT5SS][JZ]独立测试\uE004\r\n下一段\uE005");
  assert.equal(result.blocks.length, 2);
  assert.deepEqual(
    result.blocks.map((b) => [b.text, b.align, b.fontSize, b.fontFamily]),
    [
      ["独立测试", "center", 10.5, "serif"],
      ["下一段", "left", 10.5, "serif"],
    ],
  );
});
test("supported delimiters, explicit point size and line marker", () => {
  const { blocks } = parseFbd("〖HT12.50K〗〚JY〛甲〓乙\uE003丙\uE005");
  assert.equal(blocks[0].fontSize, 12.5);
  assert.equal(blocks[0].fontFamily, "kai");
  assert.equal(blocks[0].align, "right");
  assert.equal(blocks[0].text, "甲　乙\n丙");
});
test("unknown annotations remain visible beside supported inline styling", () => {
  const source = "[BX99]原创[HT3H]内容[TP图形]";
  const result = parseFbd(source);
  assert.equal(result.blocks[0].text, "[BX99]原创内容[TP图形]");
  assert.equal(result.blocks[0].fontFamily, undefined);
  assert.deepEqual(result.blocks[0].marks, [{start:8,end:16,fontFamily:'sans',fontSize:16}]);
  assert.ok(result.warnings.some((w) => w.includes("[TP图形]")));
});
test('inline marks use UTF16 offsets and persist across paragraphs', () => {
  const result = parseFbd('[HT5SS]甲😀[HTH]乙[HT12.K]丙[HT5SS]丁\uE004戊\uE005');
  assert.equal(result.blocks[0].text, '甲😀乙丙丁');
  assert.deepEqual(result.blocks[0].marks, [
    {start:3,end:4,fontFamily:'sans',fontSize:10.5},
    {start:4,end:5,fontFamily:'kai',fontSize:12},
  ]);
  assert.equal(result.blocks[1].fontFamily, 'serif');
  assert.equal(result.blocks[1].marks, undefined);
});
test('closed simple BT title separates adjacent body and records level', () => {
  const result = parseFbd('正文[BT(2]原创标题[HTH]后缀[BT)]后文\uE005');
  assert.deepEqual(result.blocks.map(b=>[b.type,b.text]), [['paragraph','正文'],['heading','原创标题后缀'],['paragraph','后文']]);
  assert.equal(result.blocks[1].level,2);
  assert.ok(result.warnings.some(w=>w.includes('PRO')));
  for (const source of ['[BT(1]未闭合','[BT(8]八级[BT)]']) assert.equal(parseFbd(source).blocks[0].text,source);
});
test('only a whole-document unadorned FL region maps to global layout', () => {
  assert.deepEqual(parseFbd('〖FL(2〗两栏稿\uE004续文〖FL)〗\uE005').layout,{columns:2});
  assert.deepEqual(parseFbd('[FL(4]四栏稿[FL)]').layout,{columns:4});
  for (const source of ['前文[FL(2]局部[FL)]', '[FL(2K8mm]内容[FL)]','[FL(2]甲[FL(1]乙[FL)][FL)]']) {
    const result=parseFbd(source); assert.equal(result.layout,undefined); assert.equal(result.blocks[0].text,source);
  }
});
test('SJ is paragraph scoped, persists, and inline changes affect next paragraph', () => {
  const result=parseFbd('[SJ5。3]首段[SJJ0]末尾\uE004次段\uE004[SJ]末段\uE005');
  assert.equal(result.blocks[0].indentPt,31.5);
  assert.equal(result.blocks[1].indent,0);
  assert.equal(result.blocks[2].indent,2);
  assert.equal(parseFbd('[SJJ12p]甲').blocks[0].indentPt,12);
  assert.equal(parseFbd('[SJJ25.4mm]甲').blocks[0].indentPt,72);
  for (const source of ['[SJ1。10]甲','[SJJ21]甲']) assert.equal(parseFbd(source).blocks[0].text,source);
});
test("physical newlines do not fabricate BD paragraphs", () => {
  assert.equal(parseFbd("甲\r\n乙\n丙\uE005").blocks[0].text, "甲乙丙");
});
test("unknown header, controls and post-end content survive", () => {
  const result = parseFbd("0000001甲\\=\uE000\uE005乙");
  assert.equal(result.blocks[0].text, "0000001甲\\=\uE000乙");
  assert.ok(result.warnings.some((w) => w.includes("结束符后")));
  assert.ok(result.warnings.some((w) => w.includes("U+E000")));
});
test("malformed and unsupported HT parameters survive", () => {
  for (const source of [
    "[HT]",
    "[HT5,6SS]",
    "[HT5《测试字体》]",
    "[HT0.SS]",
    "[HT999.SS]",
    "[HT100.SS]",
    "[HT1.SS]",
    "[JZ(]甲[JZ)]",
    "[HT5SS",
  ]) {
    const result = parseFbd(source);
    assert.equal(result.blocks[0].text, source);
    assert.ok(result.warnings.length);
  }
});
test("empty input and repeated end markers remain bounded", () => {
  assert.deepEqual(parseFbd("").blocks, []);
  assert.deepEqual(parseFbd("\uE005\uE005").blocks, []);
  assert.throws(() => parseFbd(null), TypeError);
});
test('legacy private control bytes decode consistently in supported decoders', () => {
  for (const encoding of ['gbk', 'gb18030']) {
    const text = new TextDecoder(encoding,{fatal:true}).decode(Uint8Array.from([0xaa,0xa4,0xaa,0xa5,0xaa,0xa6]));
    assert.equal(text,'\uE003\uE004\uE005');
  }
});

