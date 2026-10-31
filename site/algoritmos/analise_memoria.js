
'use strict';

const assert = require('node:assert/strict');

// Selection Sort no próprio array.
// Não cria outro array proporcional a n.
function selectionSortNoLocal(dados) {
    for (let i = 0; i < dados.length - 1; i++) {
        let menor = i;

        for (let j = i + 1; j < dados.length; j++) {
            if (dados[j] < dados[menor]) menor = j;
        }

        [dados[i], dados[menor]] = [dados[menor], dados[i]];
    }

    return dados;
}

// Merge Sort com um único buffer auxiliar de n posições.
function mergeSortComBuffer(dados) {
    const auxiliar = new Array(dados.length);

    function ordenar(inicio, fim) {
        if (fim - inicio <= 1) return;

        const meio = Math.floor((inicio + fim) / 2);

        ordenar(inicio, meio);
        ordenar(meio, fim);

        let i = inicio;
        let j = meio;
        let k = inicio;

        while (i < meio && j < fim) {
            auxiliar[k++] = dados[i] <= dados[j]
                ? dados[i++]
                : dados[j++];
        }

        while (i < meio) auxiliar[k++] = dados[i++];
        while (j < fim) auxiliar[k++] = dados[j++];

        for (let p = inicio; p < fim; p++) {
            dados[p] = auxiliar[p];
        }
    }

    ordenar(0, dados.length);
    return dados;
}

console.log('=== BIOIOT - ANALISE DE MEMORIA AUXILIAR ===');
console.log('Quantidade | Selection Sort | Buffer Merge Sort | Pilha Merge Sort');

for (const n of [10, 100, 1000, 10000]) {
    const entrada = Array.from(
        { length: n },
        (_, i) => (i * 37 + 13) % 101
    );

    const esperado = [...entrada].sort((a, b) => a - b);

    assert.deepEqual(selectionSortNoLocal([...entrada]), esperado);
    assert.deepEqual(mergeSortComBuffer([...entrada]), esperado);

    // Números de posições de armazenamento auxiliares,
    // não bytes medidos pelo sistema operacional.
    const bufferSelection = 'constante';
    const bufferMerge = n;
    const niveisRecursao = Math.ceil(Math.log2(n)) + 1;

    console.log(
        `${String(n).padStart(10)} | ` +
        `${String(bufferSelection).padStart(14)} | ` +
        `${String(bufferMerge).padStart(17)} | ` +
        `${niveisRecursao} niveis`
    );
}

console.log('\nAnalise de memoria concluida com sucesso!');