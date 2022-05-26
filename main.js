// main interface

var assemblyInput = CodeMirror.fromTextArea($(".input")[0], {lineNumbers: true});

function nav(url) {
  window.location = url;
}

function downloadAssembly() {
  let w = window.open("", "", "popup=1,width=500,height=500");
  w.document.write("<pre>" + assemblyInput.getValue() + "</pre>");
}

var validAssembly = false; // false, or a ByteArray
var processor = false;

function reset() {
  if (validAssembly) { // ready to step
    processor = new Processor(validAssembly);
    $(".processor").removeClass("blocked");
  }
  else { // not ready, disable proc
    processor = false;
    $(".processor").addClass("blocked");
  }
}

reset();
$(".reset").click(reset);

$(".step").click(e => {
  processor.step();
})

$(".assemble").click(e => {
  let assembler = new Assembler(assemblyInput.getValue());
  let out = "(empty)";
  try {
    let memOut = assembler.assemble();
    out = memOut.toHex();
    $(".output").removeClass("err");
    validAssembly = memOut;
  }
  catch (err) {
    $(".output").addClass("err");
    out = err.toString();
    validAssembly = false;
  }
  $(".output").text(out);
  reset();
});