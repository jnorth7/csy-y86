// var defaultState = {
//   "newPC": null,
//   "valM": null,
//   "Cnd": null,
//   "valE": null,
//   "valA": null,
//   "valB": null,
//   "Instr": null,
//   "rA": null,
//   "rB": null,
//   "valC": null,
//   "valP": null,
//   // register file
//   "rax": null,
//   "rcx": null,
//   "rdx": null,
//   "rbx": null,
//   "rsp": null,
//   "rbp": null,
//   "rsi": null,
//   "rdi": null,
//   "Z": null,
//   "S": null,
//   "O": null,
// }

const icodes = {
  0: "halt",
  1: "nop",
  2: "rrmovq",
  3: "irmovq",
  4: "rmmovq",
  5: "mrmovq",
  6: "OPq",
  7: "jXX",
  // 2: "cmovXX",
  8: "call",
  9: "ret",
  10: "pushq",
  11: "popq"
}

class Processor {
  constructor(memory) {
    // reset memory
    this.mem = memory;
    this.mem.seek(0);

    // reset state
    this.state = {};
    // for (let k in defaultState) {
    //   this.state[k] = 0;
    // }
    this.state.rax = 0n;
    this.state.rcx = 0n;
    this.state.rdx = 0n;
    this.state.rbx = 0n;
    this.state.rsp = 0n;
    this.state.rbp = 0n;
    this.state.rsi = 0n;
    this.state.rdi = 0n;
    this.state.PC = 0n;
    this.state.newPC = 0n;
    this.state.Z = false;
    this.state.S = false;
    this.state.O = false;
    this.state["Stat"] = "AOK"

    this.render();
  }

  render() {
    // fields
    for (let key in this.state) {
      $("." + key).text(this.state[key]);
    }
    // refresh memory
    $(".output").text(this.mem.toHex());
  }

  run() {
    // capped at 1k instructions to prevent
    // crashes from infinite loops
    for (let i=0; i<1000; i++) {
      this.step();
    }
  }

  step() {    
    // exit if not AOK
    if (this.state.Stat != "AOK") {
      return;
    }

    // wrap in err processor
    try {
      // feed forward PC
      this.state.PC = this.state.newPC;

      // processing sequence
      this.fetch();
      this.decode();
      this.execute();
      this.memory();
      this.writeBack();
      this.pcUpdate();

      // re-render
      this.render();
    } catch (e) {
      this.state.Stat = "ERR"
      $(".output").addClass("err")
      $(".output").text("Processor Error\n---------------\n" + e.toString());
      validAssembly = false;
      reset();
    }
  }

  fetch() {
    this.mem.seek(this.state.PC);

    // get instr name, icode, ifn
    let b1 = this.mem.readByte();
    this.state.icode = this.first(b1);
    this.state.ifn = this.second(b1);
    this.state.Instr = icodes[this.state.icode];
    if ((this.state.Instr === "rrmovq") && (this.state.ifn !== 0)) {
      this.state.Instr = "cmovXX"
    }
    let ins = this.state.Instr;

    // get rA and rB
    if (["jXX", "call"].includes(ins)) {
      this.state.rA = 15;
      this.state.rB = 15;
    }
    else {
      let regs = this.mem.readByte();
      this.state.rA = this.first(regs);
      this.state.rB = this.second(regs);
    }

    // default valP update
    this.state.valP = this.state.PC + 16n;

    // read valC (if present)
    this.state.valC = this.mem.readSigned();
  }

  decode() {
    // valA and valB
    this.state.valA = this.R(this.state.rA);
    this.state.valB = this.R(this.state.rB);

    // instruction-specific changes
    let ins = this.state.Instr;
    if (ins === "ret") {
      this.state.valA = this.R(4);
      this.state.valB = this.R(4);
    }
    else if (ins === "pushq") {
      this.state.valB = this.R(4);
    }
    else if (ins === "popq") {
      this.state.valA = this.R(4);
      this.state.valB = this.R(4);
    }
    else if (ins === "call") {
      this.state.valB = this.R(4);
    }
  }

  execute() {
    // defaults
    this.state.Cnd = "---";
    this.state.valE = "---";
    let ins = this.state.Instr;

    // execute instruction
    if (ins === "OPq") {
      this.state.valE = this.op(this.state.ifn, this.state.valB, this.state.valA);
    }
    else if (ins === "rrmovq") {
      this.state.valE = this.state.valA;
    }
    else if (ins === "irmovq") {
      this.state.valE = this.state.valC;
    }
    else if (ins === "ret") {
      this.state.valE = this.state.valB + 8n;
    }
    else if (ins === "rmmovq") {
      this.state.valE = this.state.valB + this.state.valC;
    }
    else if (ins === "mrmovq") {
      this.state.valE = this.state.valB + this.state.valC;
    }
    else if (ins === "pushq") {
      this.state.valE = this.state.valB - 8n;
    }
    else if (ins === "popq") {
      this.state.valE = this.state.valB + 8n;
    }
    else if (ins === "jXX") {
      this.state.Cnd = this.Cond(this.state.ifn);
    }
    else if (ins === "call") {
      this.state.valE = this.state.valB - 8n;
    }
    else if (ins === "cmovXX") {
      this.state.Cnd = this.Cond(this.state.ifn);
      this.state.valE = this.state.valA;
    }
    else if (ins === "halt") {
      this.state.Stat = "HALT"
    }
  }

  // memory and write-back (combined)
  memory() {
    // defaults
    this.state.valM = "---";
    let ins = this.state.Instr;

    if (ins === "ret") {
      this.state.valM = this.readLong(this.state.valA);
    }
    else if (ins === "rmmovq") {
      this.writeLong(this.state.valE, this.state.valA);
    }
    else if (ins === "mrmovq") {
      this.state.valM = this.readLong(this.state.valE);
    }
    else if (ins === "pushq") {
      this.writeLong(this.state.valE, this.state.valA);
    }
    else if (ins === "popq") {
      this.state.valM = this.readLong(this.state.valA);
    }
    else if (ins === "call") {
      this.writeLong(this.state.valE, this.state.valP);
    }
  }

  writeBack() {
    // defaults
    let ins = this.state.Instr;

    if (["OPq", "rrmovq", "irmovq"].includes(ins)) {
      this.setR(this.state.rB, this.state.valE);
    }
    else if (ins === "ret") {
      this.state.rsp = this.state.valE;
    }
    else if (ins === "mrmovq") {
      this.setR(this.state.rA, this.state.valM);
    }
    else if (ins === "pushq") {
      this.state.rsp = this.state.valE;
    }
    else if (ins === "popq") {
      this.state.rsp = this.state.valE;
      this.setR(this.state.rA, this.state.valM);
    }
    else if (ins === "call") {
      this.state.rsp = this.state.valE;
    }
    else if (ins === "cmovXX") {
      if (this.state.Cnd) {
        this.setR(this.state.rB, this.state.valE);
      }
    }
  }

  pcUpdate() {
    // default: valP
    let ins = this.state.Instr;
    this.state.newPC = this.state.valP;

    if (ins === "ret") {
      this.state.newPC = this.state.valM;
    }
    else if (ins === "jXX") {
      if (this.state.Cnd) {
        this.state.newPC = this.state.valC;
      }
    }
    else if (ins === "call") {
      this.state.newPC = this.state.valC;
    }
  }

  writeLong(i, val) {
    this.mem.seek(i);
    this.mem.writeLong(val);
  }

  readLong(i) { // read a long at pointer i
    this.mem.seek(i);
    return this.mem.readSigned();
  }

  // check condition code
  Cond(ifn) {
    let S = this.state.S;
    let Z = this.state.Z;
    console.log(ifn);
    // unconditional
    if (ifn === 0) {
      return true;
    }
    // le
    else if (ifn === 1) {
      return S || Z;
    }
    // l
    else if (ifn === 2) {
      return S;
    }
    // e
    else if (ifn === 3) {
      return Z;
    }
    // ne
    else if (ifn === 4) {
      return !Z;
    }
    // ge
    else if (ifn === 5) {
      return !S;
    }
    // g
    else if (ifn === 6) {
      return !S && !Z;
    }
    throw Error("illegal Cond");
  }

  // compute a (f) b
  op(f, a, b) {
    // compute
    let ans = 0n;
    if (f === 0) {
      ans = a + b;
    }
    else if (f === 1) {
      ans = a - b;
    }
    else if (f === 2) {
      ans = a & b;
    }
    else if (f === 3) {
      ans = a ^ b;
    }

    // CC (O never set since JS uses BigInt)
    this.state.S = (ans < 0);
    this.state.Z = (ans == 0);
    return ans;
  }

  // read numbered register
  R(n) {
    if (n === 15) {
      // empty reg
      return "---";
    }
    const registers = {
      0: "rax",
      1: "rcx",
      2: "rdx",
      3: "rbx",
      4: "rsp",
      5: "rbp",
      6: "rsi",
      7: "rdi"
    }
    return this.state[registers[n]];
  }

  // set numbered regisetr
  setR(n, v) {
    const registers = {
      0: "rax",
      1: "rcx",
      2: "rdx",
      3: "rbx",
      4: "rsp",
      5: "rbp",
      6: "rsi",
      7: "rdi"
    }
    this.state[registers[n]] = v;
  }

  // extract nibbles
  first(b) {
    return (b & 0xF0) >> 4;
  }
  second(b) {
    return b & 0x0F;
  }
}





