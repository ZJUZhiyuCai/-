"""Embed plain RGB PNG IDAT bytes in PDF without expanding the pixel buffer.

For PNGs containing color profiles, transparency or other color transforms,
return None so the normal image path retains their semantics.
"""
import struct,zlib
from io import BytesIO

def png_pdf(raw):
    if raw[:8]!=b"\x89PNG\r\n\x1a\n":return None
    chunks=[];offset=8
    while offset<len(raw):
        if offset+12>len(raw):raise ValueError("Truncated PNG chunk")
        size=struct.unpack(">I",raw[offset:offset+4])[0];end=offset+12+size
        if end>len(raw):raise ValueError("Truncated PNG data")
        kind=raw[offset+4:offset+8];data=raw[offset+8:end-4]
        if zlib.crc32(kind+data)&0xffffffff!=struct.unpack(">I",raw[end-4:end])[0]:raise ValueError("PNG CRC mismatch")
        chunks.append((kind,data));offset=end
    if not chunks or chunks[0][0]!=b"IHDR" or chunks[-1]!=(b"IEND",b""):raise ValueError("Invalid PNG structure")
    if any(k not in (b"IHDR",b"IDAT",b"IEND") for k,d in chunks):return None
    width,height,depth,color,compression,filtering,interlace=struct.unpack(">IIBBBBB",chunks[0][1])
    if (depth,color,compression,filtering,interlace)!=(8,2,0,0,0):return None
    if not 0<width*height<=125000000:raise ValueError("PNG pixel limit")
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject,NameObject,NumberObject,EncodedStreamObject,DecodedStreamObject
    name=NameObject;number=NumberObject
    image=EncodedStreamObject();image._data=b"".join(d for k,d in chunks if k==b"IDAT")
    image.update({name("/Type"):name("/XObject"),name("/Subtype"):name("/Image"),name("/Width"):number(width),name("/Height"):number(height),name("/BitsPerComponent"):number(8),name("/ColorSpace"):name("/DeviceRGB"),name("/Filter"):name("/FlateDecode"),name("/DecodeParms"):DictionaryObject({name("/Predictor"):number(15),name("/Colors"):number(3),name("/BitsPerComponent"):number(8),name("/Columns"):number(width)})})
    writer=PdfWriter();page=writer.add_blank_page(width=width,height=height)
    page[name("/Resources")]=DictionaryObject({name("/XObject"):DictionaryObject({name("/Im0"):writer._add_object(image)})})
    content=DecodedStreamObject();content.set_data(f"q {width} 0 0 {height} 0 0 cm /Im0 Do Q".encode())
    page[name("/Contents")]=writer._add_object(content)
    output=BytesIO();writer.write(output);return output.getvalue()
