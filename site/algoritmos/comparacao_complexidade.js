
'use strict';

const { selectionSort, mergeSort } = require('./ordenacao');

// Versão instrumentada do Selection Sort.
// Conta comparações entre elementos.
function medirSelectionSort(valores) {
    const dados = [...valores];
    let comparacoes = 0;

    for (let i = 0; i < dados.length - 1; i++) {
        let menor = i;

        for (let j = i + 1; j < dados.length; j++) {
            comparacoes++;

            if (dados[j] < dados[menor]) {
                menor = j;
            }
        }

        if (menor !== i) {
            [dados[i], dados[menor]] = [dados[menor], dados[i]];
        }
    }

    return { dados, comparacoes };
}

// Versão instrumentada do Merge Sort.
// Conta comparações entre elementos na intercalação.
function medirMergeSort(valores) {
    let comparacoes = 0;

    function ordenar(lista) {
        if (lista.length <= 1) return [...lista];

        const meio = Math.floor(lista.length / 2);
        const esquerda = ordenar(lista.slice(0, meio));
        const direita = ordenar(lista.slice(meio));

        const resultado = [];
        let i = 0;
        let j = 0;

        while (i < esquerda.length && j < direita.length) {
            comparacoes++;

            if (esquerda[i] <= direita[j]) {
                resultado.push(esquerda[i++]);
            } else {
                resultado.push(direita[j++]);
            }
        }

        while (i < esquerda.length) resultado.push(esquerda[i++]);
        while (j < direita.length) resultado.push(direita[j++]);

        return resultado;
    }

    return {
        dados: ordenar(valores),
        comparacoes
    };
}

// Gera dados reproduzíveis, semelhantes a valores de BPM.
// São dados simulados, não medições reais de pacientes.
function gerarMedicoes(quantidade) {
    return Array.from(
        { length: quantidade },
        (_, i) => 60 + ((i * 37 + 13) % 61)
    );
}

console.log('\n=== BIOIOT - COMPARAÇÃO DE COMPLEXIDADE ===\n');

console.log(
    'Quantidade | Selection Sort | Merge Sort | Redução de comparações'
);

for (const quantidade of [10, 100, 500, 1000]) {
    const entrada = gerarMedicoes(quantidade);

    const selection = medirSelectionSort(entrada);
    const merge = medirMergeSort(entrada);

    const esperado = [...entrada].sort((a, b) => a - b);

    if (
        JSON.stringify(selection.dados) !== JSON.stringify(esperado) ||
        JSON.stringify(merge.dados) !== JSON.stringify(esperado)
    ) {
        throw new Error('Resultado incorreto na ordenação!');
    }

    // Confere também o funcionamento dos algoritmos originais.
    if (
        JSON.stringify(selectionSort(entrada)) !== JSON.stringify(esperado) ||
        JSON.stringify(mergeSort(entrada)) !== JSON.stringify(esperado)
    ) {
        throw new Error('Algoritmo original incorreto!');
    }

    const reducao = (
        (1 - merge.comparacoes / selection.comparacoes) * 100
    ).toFixed(2);

    console.log(
        `${String(quantidade).padStart(10)} | ` +
        `${String(selection.comparacoes).padStart(14)} | ` +
        `${String(merge.comparacoes).padStart(10)} | ` +
        `${reducao}%`
    );
}

console.log('\nExperimento concluído com sucesso!');