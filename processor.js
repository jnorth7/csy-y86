var defaultState = {
  "newPC": null,
  "valM": null,
  "Cnd": null,
  "valE": null,
  "valA": null,
  "valB": null,
  "dstE": null,
  "dstM": null,
  "srcA": null,
  "srcB": null,
  "Instr": null,
  "rA": null,
  "rB": null,
  "valC": null,
  "valP": null,
  // register file
  "rax": null,
  "rcx": null,
  "rdx": null,
  "rbx": null,
  "rsp": null,
  "rbp": null,
  "rsi": null,
  "rdi": null,
  "Z": null,
  "S": null,
  "O": null,
}

const icodes = {
  0: "halt",
  1: "nop",
  2: "rrmovq",
  3: "irmovq",
  4: "rmmovq",
  5: "mrmovq",
  6: "OPq",
  7: "jXX",
  2: "cmovXX",
  8: "call",
  9: "ret",
  10: "pushl",
  11: "popl"
}

class Processor {
  constructor(memory) {
    // reset memory
    this.mem = memory;
    this.mem.seek(0);

    // reset state
    this.state = {};
    for (let k in defaultState) {
      this.state[k] = 0;
    }
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

  step() {    
    // exit if not AOK
    if (this.state.Stat != "AOK") {
      return;
    }

    // feed forward PC
    this.state.PC = this.state.newPC;

    // processing sequence
    this.fetch();

    // replace this later
    this.state.newPC = this.state.PC + 16;

    // re-render
    this.render();
  }

  fetch() {
    this.mem.seek(this.state.PC);

    // get instr name, icode, ifn
    let b1 = this.mem.readByte();
    this.state.icode = this.first(b1);
    this.state.ifn = this.second(b1);
    this.state.Instr = icodes[this.state.icode];
    let ins = this.state.Instr;

    // get rA and rB
    if (!(["jXX", "call"].includes(ins))) {
      let regs = this.mem.readByte();
      this.state.rA = this.first(regs);
      this.state.rB = this.second(regs);
    }

    // default valP update
    this.state.valP = this.state.PC + 16;

    // read valC (if present)
    this.state.valC = this.mem.readSigned();
  }

  // read numbered register
  R(n) {
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

  // extract nibbles
  first(b) {
    return (b & 0xF0) >> 4;
  }
  second(b) {
    return b & 0xF
  }
}





