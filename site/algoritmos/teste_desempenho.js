
'use strict';

const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { selectionSort, mergeSort } = require('./ordenacao');

function gerarDados(n) {
    return Array.from(
        { length: n },
        (_, i) => 60 + ((i * 37 + 13) % 61)
    );
}

function medirTempo(algoritmo, entrada, repeticoes = 7) {
    const tempos = [];

    // Aquecimento para reduzir influência da compilação JIT.
    for (let i = 0; i < 3; i++) {
        algoritmo(entrada);
    }

    for (let i = 0; i < repeticoes; i++) {
        const inicio = performance.now();
        algoritmo(entrada);
        const fim = performance.now();

        tempos.push(fim - inicio);
    }

    // Mediana: menos sensível a execuções atípicas.
    tempos.sort((a, b) => a - b);
    return tempos[Math.floor(tempos.length / 2)];
}

console.log('\n=== BIOIOT - TESTE DE TEMPO DE EXECUÇÃO ===');
console.log('Tempos em milissegundos (mediana de 7 execuções)\n');

console.log('Quantidade | Selection Sort (ms) | Merge Sort (ms)');

for (const n of [100, 500, 1000, 2000, 5000]) {
    const dados = gerarDados(n);

    const esperado = [...dados].sort((a, b) => a - b);

    assert.deepEqual(selectionSort(dados), esperado);
    assert.deepEqual(mergeSort(dados), esperado);

    const tempoSelection = medirTempo(selectionSort, dados);
    const tempoMerge = medirTempo(mergeSort, dados);

    console.log(
        `${String(n).padStart(10)} | ` +
        `${tempoSelection.toFixed(4).padStart(19)} | ` +
        `${tempoMerge.toFixed(4).padStart(15)}`
    );
}

console.log('\nTeste de desempenho concluído!');