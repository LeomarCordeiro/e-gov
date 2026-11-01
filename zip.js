// Small, dependency-free ZIP writer (stored entries, UTF-8 names). Used for local document bundles.
const encoder = new TextEncoder();
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit=0;bit<8;bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function createZip(files) {
  const chunks=[], central=[];
  let offset=0, centralSize=0;
  for (const file of files) {
    const name=encoder.encode(file.name), data=typeof file.data==='string'?encoder.encode(file.data):file.data;
    const crc=crc32(data);
    const header=new Uint8Array(30+name.length), view=new DataView(header.buffer);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);
    view.setUint16(12,33,true);view.setUint32(14,crc,true);view.setUint32(18,data.length,true);view.setUint32(22,data.length,true);view.setUint16(26,name.length,true);header.set(name,30);
    const directory=new Uint8Array(46+name.length), cv=new DataView(directory.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);
    cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);directory.set(name,46);
    chunks.push(header,data);central.push(directory);offset+=header.length+data.length;centralSize+=directory.length;
  }
  const end=new Uint8Array(22), ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  const output=new Uint8Array(offset+centralSize+end.length);
  let position=0;for(const chunk of [...chunks,...central,end]){output.set(chunk,position);position+=chunk.length;}
  return output;
}
