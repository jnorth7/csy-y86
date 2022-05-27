// Assumptions:
//   - All ints are 8 bytes
//   - Align on 8-byte boundaries
//   - All instructions padded to 16 bytes
//   - Numbers are little-endian
//   - since registers are 8 bytes, rrmovq instead of rrmovl etc
//     - and registars are %rax instead of %eax
//     - and addq instead of addl, etc

class Byte {
  // unsignedValue between 0 and 255 inclusive
  constructor(unsignedValue) {
    this.unsignedValue = unsignedValue;
  }

  // Get padded hex value (2 chars)
  toHex() {
    let firstHalf = Number((this.unsignedValue & 0xF0) >> 4);
    let secondHalf = Number(this.unsignedValue & 0x0F);
    return firstHalf.toString(16) + secondHalf.toString(16);
  }
}

// List of bytes with a movable cursor
class ByteList {
  constructor() {
    this.cursor = 0; // next index
    this.bytes = []; // stored bytes
  }

  // move cursor, filling in 00s as needed
  seek(i) {
    const MAX_I = 10000 // prevent crashes by going to bad addresses
    if (i > MAX_I) {
      throw new Error(`Illegal memory seek\nTarget address ${i} > max address ${MAX_I}`);
    }
    i = Number(i);
    for (let j=this.cursor; j<i; j++) {
      if (!this.bytes[j]) {
        this.bytes[j] = new Byte(0);
      }
    }
    this.cursor = i;
  }

  // write a byte
  write(byte) {
    this.bytes[this.cursor] = byte;
    this.cursor += 1;
  }

  // convert a bigint to an array of 8 little-endian bytes
  longToBytes(n) {
    let bytes = [];
    for (let i = 0; i <= 7*8; i += 8) {
      bytes.push(new Byte(Number((BigInt(n) >> BigInt(i)) & 0xFFn)));

    }
    return bytes;
  }

  // write a long using longToBytes, no targets here
  writeLong(n) {
    for (let byte of this.longToBytes(n)) {
      this.write(byte);
    }
  }

  // convert to hex string
  toHex() {
    let out = "";
    for (let byte of this.bytes) {
      out += byte.toHex() + " ";
    }
    return out;
  }

  // read a single byte (unsigned val)
  readByte() {
    let out = this.bytes[this.cursor].unsignedValue;
    this.cursor += 1;
    return out;
  }

  // read a signed long
  readSigned(width=8) {
    // pad with 0s
    this.seek(this.cursor + width);
    this.seek(this.cursor - width);
    let start = this.cursor
    // read byte range
    let bytes = this.bytes.slice(start, start+width);
    // handle two's compliment
    let n = BigInt(0);
    let offset = 0n;
    if ((bytes[width-1].unsignedValue & 0x01) != 0) {
      offset = (BigInt(2) ** BigInt(width*8));
    }
    // reverse and add bytes
    bytes.reverse();
    for (let byte of bytes) {
      n = n << 8n; // shift
      n += BigInt(byte.unsignedValue) // add
    }
    this.cursor += width;
    return n - offset;
  }
}

// A stack of characters to read
class ReadStack {
  constructor(source) {
    this.source = source;
    this.i = 0;
    this.len = source.length;
    this.labels = {};
  }

  // read a character, false for EOF
  read() {
    let out = this.peek();
    if (out) {
      this.i += 1;
    }
    return out;
  }

  // peek a character without reading
  peek() {
    if (this.i == this.len) {
      return false;
    }
    return this.source[this.i];
  }

  // get current line number (starting from 1)
  lineNumber() {
    let n = 1;
    for (let j=0; j<this.i; j++) {
      if (this.source[j] === "\n") {
        n += 1;
      }
    }
    return n;
  }
  
  // signal a syntax error
  err(msg) {
    throw Error(`Y86 Syntax Error (Line ${this.lineNumber()})\n${msg}`);
  }
}

// Main assembler, converts assembly text to byte array
class Assembler {
  constructor(source) {
    this.stack = new ReadStack(source);
    this.mem = new ByteList();
    this.labels = {};
    this.targets = {};
    this.align = 8;
  }

  // utility method to write a byte, as a number, to memory
  wrb(n) {
    this.mem.write(new Byte(n));
  }

  // entry method, runs the assembler and returns byte list
  assemble() {
    // first pass: instruction conversion
    this.trim();
    while (this.stack.peek()) {
      this.readLine();
      this.trim();
    }
    
    // second pass: symbolic linking
    for (let loc in this.targets) {
      loc = Number(loc);
      this.mem.seek(loc);
      let label = this.targets[loc]
      if (!(label in this.labels)) {
        this.stack.err(`Undefined label '${label}'`)
      }
      this.writeLong(BigInt(this.labels[label]));
    }
    console.log(this.labels, this.targets);
    // return bytes in memory
    return this.mem
  }

  // read an instruction, directive, label, or comment
  readLine() {
    // comment (single-line, starts with #)
    if (this.stack.peek() === "#") {
      while (this.stack.peek() && (this.stack.read() != "\n")) {}
      return;
    }

    // instruction, directive, or label
    let token = this.readToken();
    if (token.startsWith(".")) {
      // directive
      this.readDirective(token);
    }
    else if (token.endsWith(":")) {
      // label
      this.labels[token.slice(0, token.length - 1)] = this.mem.cursor;
    }
    else {
      // instructon
      this.readInstruction(token);
    }
  }

  // read a y86 instruction
  readInstruction(name) {
    // save start for padding
    let iStart = this.mem.cursor;
    this.trim();
    
    // vaild instruction names
    let instructions = "halt nop rrmovq irmovq rmmovq mrmovq"
    instructions += " addq subq andq xorq jmp jle jl je jne jge jg"
    instructions += " rrmovq cmovle cmovl cmove cmovne cmovge cmovg"
    instructions += " call ret pushq popq";
    instructions = instructions.split(" ");

    // verify instruction name
    if (!instructions.includes(name)) {
      this.stack.err(`Unrecognized instruction '${name}'`);
    }

    // simple instructions
    const simpleInstructions = {
      "halt": 0x00,
      "nop": 0x10,
      "ret": 0x90
    }

    // operations
    const ops = {
      "addq": 0x60,
      "subq": 0x61,
      "andq": 0x62,
      "xorq": 0x63
    }

    // condition codes
    const codes = {
      "mp": 0,
      "le": 1,
      "l": 2,
      "e": 3,
      "ne": 4,
      "ge": 5,
      "g": 6
    }
    
    // handle instruction (known to be valid)
    // simple
    if (name in simpleInstructions) {
      this.wrb(simpleInstructions[name]);
    }
    // one-register
    else if (name === "pushq") {
      this.wrb(0xA0);
      this.wrb(this.mergeNibbles(this.readRegister(), 0xf));
    }
    else if (name === "popq") {
      this.wrb(0xB0);
      this.wrb(this.mergeNibbles(this.readRegister(), 0xf));
    }
    // two-register
    else if (name === "rrmovq") {
      this.wrb(0x20);
      this.wrb(this.readTwoRegisters());
    }
    else if (name in ops) {
      this.wrb(ops[name]);
      this.wrb(this.readTwoRegisters());
    }
    else if (name.startsWith("cmov")) {
      let conditionCode = name.slice(4);
      this.wrb(this.mergeNibbles(0x2, codes[conditionCode]));
      this.wrb(this.readTwoRegisters());
    }
    // moves, jumps, and calls
    else if (name === "call") {
      this.wrb(0x80);
      this.writeLong(this.readImmediate());
    }
    else if (name.startsWith("j")) {
      let conditionCode = name.slice(1);
      this.wrb(this.mergeNibbles(0x7, codes[conditionCode]));
      this.writeLong(this.readImmediate());
    }
    else if (name === "irmovq") {
      let V = this.readImmediate();
      this.trim();
      this.readStrict(",");
      this.trim();
      let rB = this.readRegister();
      this.wrb(0x30);
      this.wrb(this.mergeNibbles(0xf, rB));
      this.writeLong(V);
    }
    else if (name === "rmmovq") {
      let rA = this.readRegister();
      this.trimc();
      let D = this.readImmediate();
      this.readStrict("(");
      let rB = this.readRegister();
      this.readStrict(")");
      this.wrb(0x40);
      this.wrb(this.mergeNibbles(rA, rB));
      this.writeLong(D);
    }
    else if (name === "mrmovq") {
      let D = (this.stack.peek() !== "(") ? this.readImmediate() : 0n;
      this.readStrict("(");
      let rB = this.readRegister();
      this.readStrict(")");
      this.trimc();
      let rA = this.readRegister();
      this.wrb(0x50);
      this.wrb(this.mergeNibbles(rA, rB));
      this.writeLong(D);
    }
    
    // seek 16-byte padding
    this.mem.seek(iStart + 16);
  }

  // read an immediate value (literal or label target)
  readImmediate() {
    // consume $, if present
    if (this.stack.peek() === "$") {
      this.stack.read();
    }
    // main reader
    if ("-0123456789".includes(this.stack.peek())) {
      return this.readInt();
    }
    else {
      // label, mark to return (handled by this.writeLong)
      return "target:" + this.readToken();
    }
  }

  // read two registers into an int
  readTwoRegisters() {
    this.trim();
    let a = this.readRegister();
    this.trimc();
    let b = this.readRegister();
    this.trim();
    return this.mergeNibbles(a, b);
  }
  
  // read a register into an int
  readRegister() {
    const registers = {
      "rax": 0,
      "rcx": 1,
      "rdx": 2,
      "rbx": 3,
      "rsp": 4,
      "rbp": 5,
      "rsi": 6,
      "rdi": 7,
    }
    this.readStrict("%");
    let name = this.readToken();
    if (!(name in registers)) {
      this.stack.err(`Unknown register ${name}`);
    }
    return registers[name];
  }

  // merge two 4-bit nums
  mergeNibbles(a, b) {
    return (a << 4) + b;
  }
  
  // read an assembler directive
  readDirective(name) {
    if (name === ".pos") {
      this.trim();
      this.mem.seek(Number(this.readInt()));
    }
    else if (name === ".align") {
      this.trim();
      this.align = Number(this.readInt());
    }
    else if ((name === ".long") || (name === ".quad")) {
      this.trim();
      // insert number (8 bytes)
      let n = this.readInt();
      this.writeLong(n);
      // backtrack to alignment
      // this.mem.seek(this.mem.cursor + (this.align - 8))
    }
  }

  // read an integer literal (decimal, 0b, or 0x)
  readInt() {
    let token = this.readToken();
    let num = 0;
    try {
      num = BigInt(token);
    }
    catch (e) {
      this.stack.err("Invalid integer literal");
    }
    return num;
  }
  
  // consume whitespace on stack
  trim() {
    while (this.isWhitespace(this.stack.peek())) {
      this.stack.read();
    }
  }

  // consume whitespace + comma
  trimc() {
    this.trim();
    this.readStrict(",");
    this.trim();
  }
  
  // consume a specified character sequence
  readStrict(chars) {
    for (let ch of chars) {
      if (this.stack.read() !== ch) {
        this.stack.err("Expected " + ch);
      }
    }
  }

  // check if a character is whitespace
  isWhitespace(c) {
    // spaces, tabs, newlines
    return " \t\n".includes(c);
  }

  // token terminators
  // check if the character is whitespace, a comma, parentheses, or an eof
  isTerminator(c) {
    return this.isWhitespace(c) || (",()".includes(c)) || !c;
  }

  // read a token, delimited by terminators
  readToken() {
    let out = "";
    while (!this.isTerminator(this.stack.peek())) {
      out += this.stack.read();
    }
    return out;
  }

  // convert a bigint to an array of 8 little-endian bytes
  longToBytes(n) {
    let bytes = [];
    for (let i = 0; i <= 7*8; i += 8) {
      bytes.push(new Byte(Number((BigInt(n) >> BigInt(i)) & 0xFFn)));

    }
    return bytes;
  }

  // write a long using longToBytes (or handle a target)
  writeLong(n) {
    // handle a target
    if (((typeof n) == "string") && n.startsWith("target:")) {
      this.targets[this.mem.cursor] = n.slice(7);
      this.writeLong(0);
    }
    else {
      for (let byte of this.longToBytes(n)) {
        this.mem.write(byte);
      }
    }
  }
}

