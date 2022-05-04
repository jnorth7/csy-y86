# Y86 Assembler
OCS35 Assignment, Trisha Vidyanand and Jake North

### Running
- To run our assembler, go to <a href="https://y86assembler.vercel.app">y86assembler.vercel.app</a>
- Main program code is in assembler.js
  + The `Assembler` class takes a code string in its constructor, and calling the `assemble` method will return a `ByteList` of the memory output. To see this in hex form, call the `toHex` method of the `ByteList`.
    * Example: `(new Assembler("irmovq 5, %rax")).assemble().toHex()`
  + If the assembler encounters a syntax error, it will throw a JS error with a message describing the problem and line number.
- The web interface is in `index.html`.

### Assumptions
- All ints are 8 bytes
- Align on 8-byte boundaries
- All instructions padded to 16 bytes
- Numbers are little-endian
- since registers are 8 bytes, rrmovq instead of rrmovl etc
  - and registars are %rax instead of %eax
  - and addq instead of addl, etc

### Citations
- Syntax highlighting in the web interface is done using <a href="https://codemirror.net">CodeMirror</a>.