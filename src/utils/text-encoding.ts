


export function decodeTextData(uint8Array: Uint8Array): string {
  
  if (
    uint8Array.length >= 4 &&
    uint8Array[0] === 0xff &&
    uint8Array[1] === 0xfe &&
    uint8Array[2] === 0x00 &&
    uint8Array[3] === 0x00
  ) {
    
    const dataWithoutBOM = uint8Array.slice(4);
    return new TextDecoder("utf-32le").decode(dataWithoutBOM);
  }
  
  else if (
    uint8Array.length >= 4 &&
    uint8Array[0] === 0x00 &&
    uint8Array[1] === 0x00 &&
    uint8Array[2] === 0xfe &&
    uint8Array[3] === 0xff
  ) {
    
    const dataWithoutBOM = uint8Array.slice(4);
    return new TextDecoder("utf-32be").decode(dataWithoutBOM);
  }
  
  else if (
    uint8Array.length >= 3 &&
    uint8Array[0] === 0xef &&
    uint8Array[1] === 0xbb &&
    uint8Array[2] === 0xbf
  ) {
    
    const dataWithoutBOM = uint8Array.slice(3);
    return new TextDecoder("utf-8").decode(dataWithoutBOM);
  }
  
  else if (uint8Array.length >= 2 && uint8Array[0] === 0xff && uint8Array[1] === 0xfe) {
    
    const dataWithoutBOM = uint8Array.slice(2);
    return new TextDecoder("utf-16le").decode(dataWithoutBOM);
  }
  
  else if (uint8Array.length >= 2 && uint8Array[0] === 0xfe && uint8Array[1] === 0xff) {
    
    const dataWithoutBOM = uint8Array.slice(2);
    return new TextDecoder("utf-16be").decode(dataWithoutBOM);
  }
  
  else {
    return new TextDecoder("utf-8").decode(uint8Array);
  }
}


export function encodeTextData(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
