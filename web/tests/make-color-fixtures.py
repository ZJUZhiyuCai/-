"""Original CC0 test assets; synthetic CMYK is NOT a printing condition.
Requires Pillow. Generates small repeatable images and ICC LUTs.
"""
from pathlib import Path
from itertools import product
from struct import pack
from PIL import Image, ImageCms
root=Path(__file__).parent/'fixtures'
be=lambda *n:pack('>'+str(len(n))+'I',*n)
short=lambda *n:pack('>'+str(len(n))+'H',*n)
identity=be(65536,0,0,0,65536,0,0,0,65536)
def lut(channels,out,fn):
    values=[v for point in product((0,65535),repeat=channels) for v in fn(point)]
    return b'mft2'+bytes(4)+bytes([channels,out,2,0])+identity+short(2,2)+short(0,65535)*channels+short(*values)+short(0,65535)*out
name=b'Shuye TEST ONLY synthetic CMYK\0'
tags=[(b'desc',b'desc'+bytes(4)+be(len(name))+name+bytes(78)),(b'cprt',b'text'+bytes(4)+b'CC0 - test fixture, never a printing profile\0'),(b'wtpt',b'XYZ '+bytes(4)+be(63190,65536,54061)),(b'A2B0',lut(4,3,lambda v:v[:3])),(b'B2A0',lut(3,4,lambda v:(65535-v[0],v[1],v[2],0)))]
header=bytearray(128);header[8:12]=be(0x02100000);header[12:24]=b'prtrCMYKLab ';header[24:36]=short(2026,10,17,0,0,0);header[36:44]=b'acspMSFT';header[68:80]=be(63190,65536,54061);header[80:84]=b'SHYE'
body=bytearray();entries=[];start=132+12*len(tags)
for tag,payload in tags:
    entries.append(tag+be(start+len(body),len(payload)));body.extend(payload);body.extend(bytes((-len(body))%4))
profile=header+be(len(tags))+b''.join(entries)+body;profile[:4]=be(len(profile));(root/'test-only-cmyk.icc').write_bytes(profile)
# Pillow sets a creation timestamp in its standard sRGB profile; not byte-identical across runs.
(root/'test-srgb.icc').write_bytes(ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
im=Image.new('CMYK',(8,8));im.putdata([(0,255,255,0),(255,0,255,0),(255,255,0,0),(0,0,0,255)]*16);im.save(root/'test-cmyk.jpg',quality=100,subsampling=0)
