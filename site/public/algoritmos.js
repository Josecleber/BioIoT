function inicializarGraficoAlgoritmos() {
    const canvas = document.getElementById('algoritmosChart');
    if (!canvas || typeof Chart === 'undefined') return;

    new Chart(canvas, {
        type: 'line',
        data: {
            labels: ['10', '100', '500', '1000'],
            datasets: [
                {
                    label: 'Selection Sort',
                    data: [45, 4950, 124750, 499500],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    tension: 0.2,
                    fill: false
                },
                {
                    label: 'Merge Sort',
                    data: [25, 556, 3940, 8865],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    tension: 0.2,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Comparações realizadas por tamanho de entrada',
                    color: '#e2e8f0'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Quantidade de medições',
                        color: '#94a3b8'
                    },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Número de comparações',
                        color: '#94a3b8'
                    },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}


function executarLaboratorioAlgoritmos() {
    const quantidade = Number(
        document.getElementById('quantidadeAlgoritmos').value
    );

    const saida = document.getElementById('resultadoLaboratorio');
    if (!saida) return;

    if (![10, 100, 500, 1000, 5000].includes(quantidade)) {
        saida.textContent = 'Quantidade inválida.';
        return;
    }

    // Dados simulados e reproduzíveis.
    const entrada = Array.from(
        { length: quantidade },
        (_, i) => 60 + ((i * 37 + 13) % 61)
    );

    function selectionSortInstrumentado(valores) {
        const dados = [...valores];
        let comparacoes = 0;

        for (let i = 0; i < dados.length - 1; i++) {
            let menor = i;

            for (let j = i + 1; j < dados.length; j++) {
                comparacoes++;
                if (dados[j] < dados[menor]) menor = j;
            }

            if (menor !== i) {
                [dados[i], dados[menor]] = [dados[menor], dados[i]];
            }
        }

        return { dados, comparacoes };
    }

    function mergeSortInstrumentado(valores) {
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

        return { dados: ordenar(valores), comparacoes };
    }

    // Medimos o tempo da execução completa de cada algoritmo.
    const inicioSelection = performance.now();
    const selection = selectionSortInstrumentado(entrada);
    const tempoSelection = performance.now() - inicioSelection;

    const inicioMerge = performance.now();
    const merge = mergeSortInstrumentado(entrada);
    const tempoMerge = performance.now() - inicioMerge;

    const esperado = [...entrada].sort((a, b) => a - b);

    const valido =
        JSON.stringify(selection.dados) === JSON.stringify(esperado) &&
        JSON.stringify(merge.dados) === JSON.stringify(esperado);

    if (!valido) {
        saida.textContent = 'Erro: os resultados da ordenação não coincidem.';
        return;
    }

    const reducao = (
        (1 - merge.comparacoes / selection.comparacoes) * 100
    ).toFixed(2);

    const formato = new Intl.NumberFormat('pt-BR');

    saida.innerHTML = `
        <div style="padding: 1rem; border: 1px solid var(--card-border);
                    border-radius: 8px;">
            <p><strong>Quantidade:</strong> ${formato.format(quantidade)} valores simulados</p>
            <p><strong>Selection Sort:</strong>
               ${formato.format(selection.comparacoes)} comparações
               — ${tempoSelection.toFixed(4)} ms</p>
            <p><strong>Merge Sort:</strong>
               ${formato.format(merge.comparacoes)} comparações
               — ${tempoMerge.toFixed(4)} ms</p>
            <p><strong>Redução de comparações:</strong> ${reducao}%</p>
            <p style="color: var(--accent-green); margin-top: 0.8rem;">
                Resultados conferidos: ambas as ordenações estão corretas.
            </p>
        </div>
    `;
    atualizarGraficoLaboratorio(
        quantidade,
        selection.comparacoes,
        merge.comparacoes
    );
}

let graficoLaboratorioInstancia = null;

function atualizarGraficoLaboratorio(quantidade, selection, merge) {
    const container = document.getElementById(
        'graficoLaboratorioContainer'
    );

    const canvas = document.getElementById('graficoLaboratorio');

    if (!container || !canvas || typeof Chart === 'undefined') {
        return;
    }

    container.style.display = 'block';

    if (graficoLaboratorioInstancia) {
        graficoLaboratorioInstancia.destroy();
    }

    graficoLaboratorioInstancia = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: ['Selection Sort', 'Merge Sort'],
            datasets: [{
                label: 'Comparações realizadas',
                data: [selection, merge],
                backgroundColor: ['#ef4444', '#3b82f6'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: `${quantidade.toLocaleString('pt-BR')} valores simulados`,
                    color: '#e2e8f0'
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#94a3b8'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#94a3b8'
                    },
                    title: {
                        display: true,
                        text: 'Número de comparações',
                        color: '#94a3b8'
                    }
                }
            }
        }
    });
}


function executarAnaliseRecursao() {
    const n = Number(document.getElementById('quantidadeRecursao').value);
    const saida = document.getElementById('resultadoRecursao');

    if (!saida || ![8, 16, 32, 64, 128, 256, 512, 1024].includes(n)) {
        return;
    }

    const estatisticas = {
        chamadas: 0,
        profundidadeMaxima: 0,
        comparacoes: 0
    };

    function ordenar(valores, profundidade) {
        estatisticas.chamadas++;
        estatisticas.profundidadeMaxima = Math.max(
            estatisticas.profundidadeMaxima,
            profundidade
        );

        if (valores.length <= 1) return [...valores];

        const meio = Math.floor(valores.length / 2);
        const esquerda = ordenar(valores.slice(0, meio), profundidade + 1);
        const direita = ordenar(valores.slice(meio), profundidade + 1);

        const resultado = [];
        let i = 0;
        let j = 0;

        while (i < esquerda.length && j < direita.length) {
            estatisticas.comparacoes++;

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

    const entrada = Array.from({ length: n }, (_, i) => n - i);
    const ordenado = ordenar(entrada, 0);

    const esperado = [...entrada].sort((a, b) => a - b);

    if (JSON.stringify(ordenado) !== JSON.stringify(esperado)) {
        saida.textContent = 'Erro na ordenação recursiva.';
        return;
    }

    const numero = new Intl.NumberFormat('pt-BR');

    saida.innerHTML = `
        <div style="padding: 1rem; border: 1px solid var(--card-border);
                    border-radius: 8px;">
            <p><strong>Elementos:</strong> ${numero.format(n)}</p>
            <p><strong>Chamadas recursivas:</strong>
                ${numero.format(estatisticas.chamadas)}</p>
            <p><strong>Profundidade máxima:</strong>
                ${estatisticas.profundidadeMaxima} níveis além da chamada inicial</p>
            <p><strong>Comparações:</strong>
                ${numero.format(estatisticas.comparacoes)}</p>

            <h4 style="color: var(--accent-blue); margin-top: 1rem;">
                Análise matemática — Teorema Mestre
            </h4>

            <p>T(n) = 2T(n/2) + Θ(n)</p>
            <p>a = 2; b = 2; f(n) = Θ(n)</p>
            <p>n<sup>log₂ 2</sup> = n</p>
            <p><strong>Resultado: T(n) = Θ(n log n)</strong></p>

            <p style="color: var(--accent-green); margin-top: 0.8rem;">
                Ordenação recursiva executada e verificada com sucesso.
            </p>
        </div>
    `;
}


function executarAnaliseMemoria() {
    const n = Number(document.getElementById('quantidadeMemoria').value);
    const saida = document.getElementById('resultadoMemoria');

    if (!saida || ![10, 100, 1000, 10000].includes(n)) {
        return;
    }

    // Utilizamos a mesma análise teórica do experimento
    // executado anteriormente no Node.js.
    const memoriaSelection = 'Θ(1)';
    const memoriaMerge = 'Θ(n)';

    const posicoesBufferMerge = n;
    const profundidadePilha = Math.ceil(Math.log2(n)) + 1;

    const numero = new Intl.NumberFormat('pt-BR');

    saida.innerHTML = `
        <div style="padding: 1rem; border: 1px solid var(--card-border);
                    border-radius: 8px;">
            <p><strong>Quantidade:</strong> ${numero.format(n)} elementos</p>

            <h4 style="color: var(--accent-blue); margin-top: 1rem;">
                Selection Sort no próprio array
            </h4>
            <p>Memória auxiliar: ${memoriaSelection}</p>
            <p>Utiliza apenas um número constante de variáveis auxiliares.</p>

            <h4 style="color: var(--accent-blue); margin-top: 1rem;">
                Merge Sort com buffer
            </h4>
            <p>Memória auxiliar: ${memoriaMerge}</p>
            <p>Buffer auxiliar: ${numero.format(posicoesBufferMerge)} posições.</p>
            <p>Profundidade máxima estimada da pilha:
                ${profundidadePilha} níveis.</p>

            <p style="color: var(--text-muted); margin-top: 1rem;">
                Estes valores representam uma análise teórica
                das estruturas auxiliares, não uma medição
                em bytes da memória RAM.
            </p>
        </div>
    `;
}


function executarAnaliseIntratabilidade() {
    const n = Number(
        document.getElementById('quantidadeIntratabilidade').value
    );

    const saida = document.getElementById('resultadoIntratabilidade');

    if (!saida || ![8, 12, 16, 18].includes(n)) return;

    const valores = Array.from(
        { length: n },
        (_, i) => 2 * (i + 1)
    );

    // O alvo é ímpar e todos os valores são pares.
    // Portanto, não existe solução para este exemplo.
    const alvo = 2 * n + 1;

    let subconjuntos = 0;
    let encontrou = false;

    function explorar(posicao, soma) {
        if (posicao === valores.length) {
            subconjuntos++;

            if (soma === alvo) encontrou = true;
            return;
        }

        explorar(posicao + 1, soma);
        explorar(posicao + 1, soma + valores[posicao]);
    }

    const inicio = performance.now();
    explorar(0, 0);
    const tempo = performance.now() - inicio;

    const numero = new Intl.NumberFormat('pt-BR');

    saida.innerHTML = `
        <div style="padding: 1rem; border: 1px solid var(--card-border);
                    border-radius: 8px;">
            <p><strong>Elementos:</strong> ${numero.format(n)}</p>
            <p><strong>Alvo:</strong> ${alvo}</p>
            <p><strong>Subconjuntos examinados:</strong>
                ${numero.format(subconjuntos)}</p>
            <p><strong>Resultado:</strong>
                ${encontrou ? 'Solução encontrada' : 'Sem solução'}</p>
            <p><strong>Tempo de execução:</strong>
                ${tempo.toFixed(4)} ms</p>

            <h4 style="color: var(--accent-blue); margin-top: 1rem;">
                Análise de complexidade
            </h4>

            <p>Busca exaustiva: Θ(2<sup>n</sup>) neste procedimento.</p>
            <p>Subset Sum é um problema NP-completo em sua versão de decisão.</p>
            <p>Uma solução candidata pode ser verificada em tempo polinomial.</p>

            <p style="color: var(--text-muted); margin-top: 1rem;">
                A busca exaustiva foi executada de propósito
                sem interrupção antecipada, para demonstrar
                o crescimento exponencial.
            </p>
        </div>
    `;
}


function executarAnalisePrecisao() {
    const saida = document.getElementById('resultadoPrecisao');
    if (!saida) return;

    // Valores simulados de BPM, não medições reais.
    const valores = [72.4, 72.6, 73.2, 73.8, 74.3];

    const arredondados = valores.map(valor => Math.round(valor));

    const media = lista =>
        lista.reduce((soma, valor) => soma + valor, 0) / lista.length;

    const mediaOriginal = media(valores);
    const mediaArredondada = media(arredondados);
    const diferenca = Math.abs(mediaOriginal - mediaArredondada);

    const linhas = valores.map((valor, i) => `
        <tr>
            <td style="padding: 8px;">${valor.toFixed(1)}</td>
            <td style="padding: 8px;">${arredondados[i]}</td>
            <td style="padding: 8px;">
                ${Math.abs(valor - arredondados[i]).toFixed(1)}
            </td>
        </tr>
    `).join('');

    saida.innerHTML = `
        <div style="padding: 1rem; border: 1px solid var(--card-border);
                    border-radius: 8px;">
            <h4 style="color: var(--accent-blue);">
                Resultado do arredondamento
            </h4>

            <table style="width: 100%; text-align: left; margin-top: 1rem;">
                <thead>
                    <tr>
                        <th>Valor original</th>
                        <th>Inteiro</th>
                        <th>Erro absoluto</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>

            <p style="margin-top: 1rem;">
                <strong>Média original:</strong>
                ${mediaOriginal.toFixed(4)}
            </p>
            <p>
                <strong>Média arredondada:</strong>
                ${mediaArredondada.toFixed(4)}
            </p>
            <p>
                <strong>Diferença entre as médias:</strong>
                ${diferenca.toFixed(4)}
            </p>

            <h4 style="color: var(--accent-blue); margin-top: 1rem;">
                Aritmética de ponto flutuante
            </h4>
            <p>0.1 + 0.2 = ${(0.1 + 0.2).toString()}</p>

            <h4 style="color: var(--accent-blue); margin-top: 1rem;">
                Comparação com o modelo BSS
            </h4>
            <p>
                O modelo BSS idealizado trabalha com números reais exatos.
                O BioIoT utiliza números de precisão finita e arredonda
                os resultados antes de enviá-los ao servidor.
            </p>
            <p style="color: var(--text-muted); margin-top: 0.8rem;">
                Experimento acadêmico com dados simulados.
                O modelo BSS não foi implementado no ESP32.
            </p>
        </div>
    `;
}


async function analisarHistoricoReal() {
    const saida = document.getElementById('resultadoHistoricoReal');
    const quantidade = Number(
        document.getElementById('quantidadeHistorico').value
    );

    if (!saida || ![10, 50, 100, 500].includes(quantidade)) return;

    saida.textContent = 'Consultando o banco SQLite...';

    try {
        const url = '/api/algoritmos/medicoes?' +
            new URLSearchParams({
                dispositivo: 'ESP32-BANCADA-01',
                quantidade: String(quantidade)
            });

        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error('Falha na consulta ao servidor.');

        const resultado = await resposta.json();
        const medicoes = resultado.medicoes;

        if (!Array.isArray(medicoes) || medicoes.length === 0) {
            saida.textContent = 'Nenhuma medição encontrada.';
            return;
        }


        // Busca linear aplicada aos registros reais.
        const campoBusca = document.getElementById('bpmBuscaHistorico');
        const textoBusca = campoBusca ? campoBusca.value.trim() : '';

        let resultadoBusca = '';

        if (textoBusca !== '') {
            const bpmProcurado = Number(textoBusca);

            if (!Number.isInteger(bpmProcurado) ||
                bpmProcurado < 1 || bpmProcurado > 300) {
                throw new Error('Informe um BPM inteiro entre 1 e 300.');
            }

            const { encontrados, verificacoes } =
                window.BioIoTAlgoritmos.buscaLinearRegistros(
                    medicoes,
                    bpmProcurado
                );

            const formatoBusca = new Intl.NumberFormat('pt-BR');

            resultadoBusca = `
                <div style="margin-top: 1.5rem;
                            padding-top: 1rem;
                            border-top: 1px solid var(--card-border);">

                    <h4 style="color: var(--accent-blue);">
                        Resultado da busca linear
                    </h4>

                    <p><strong>BPM pesquisado:</strong>
                        ${bpmProcurado}</p>

                    <p><strong>Registros encontrados:</strong>
                        ${formatoBusca.format(encontrados.length)}</p>

                    <p><strong>Verificações realizadas:</strong>
                        ${formatoBusca.format(verificacoes)}</p>

                    <p><strong>Complexidade temporal:</strong>
                        Θ(n) para esta busca completa.</p>

                    <p style="margin-top: 0.5rem;">
                        ${encontrados.length > 0
                    ? 'IDs encontrados: ' +
                    encontrados.map(r => r.id).join(', ')
                    : 'Nenhuma medição com esse BPM foi encontrada.'}
                    </p>
                </div>
            `;
        }


        const inicio = performance.now();

        const resultadoMerge =
            window.BioIoTAlgoritmos.mergeSortRegistros(medicoes);

        const tempo = performance.now() - inicio;

        const ordenados = resultadoMerge.registros;
        const comparacoes = resultadoMerge.comparacoes;



        // Solicita ao SQLite a ordenação da mesma amostra.
        const respostaSQLite = await fetch(
            '/api/algoritmos/comparar-sqlite',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    dispositivo: 'ESP32-BANCADA-01',
                    ids: medicoes.map(registro => registro.id)
                })
            }
        );

        if (!respostaSQLite.ok) {
            throw new Error('Não foi possível comparar com o SQLite.');
        }

        const resultadoSQLite = await respostaSQLite.json();

        const idsMerge = ordenados.map(registro => registro.id);
        const idsSQLite = resultadoSQLite.medicoes.map(registro => registro.id);

        const resultadosIguais =
            JSON.stringify(idsMerge) === JSON.stringify(idsSQLite);

        if (!resultadosIguais) {
            throw new Error(
                'A ordem dos registros difere entre Merge Sort e SQLite.'
            );
        }


        // Selection Sort utilizando o módulo compartilhado.
        const inicioSelection = performance.now();

        const resultadoSelection =
            window.BioIoTAlgoritmos.selectionSortRegistros(medicoes);

        const tempoSelection = performance.now() - inicioSelection;

        const ordenadosSelection = resultadoSelection.registros;
        const comparacoesSelection = resultadoSelection.comparacoes;

        // Confere os resultados independentemente da ordem
        // dos registros com BPM igual.
        const bpmMerge = ordenados.map(registro => registro.bpm);
        const bpmSelection = ordenadosSelection.map(registro => registro.bpm);

        if (JSON.stringify(bpmMerge) !== JSON.stringify(bpmSelection)) {
            throw new Error('Os algoritmos produziram resultados diferentes.');
        }

        // Verifica a ordenação sem modificar os registros originais.
        const correto = ordenados.every(
            (registro, i) => i === 0 ||
                ordenados[i - 1].bpm <= registro.bpm
        );

        const mesmaQuantidade = ordenados.length === medicoes.length;

        if (!correto || !mesmaQuantidade) {
            throw new Error('Falha ao validar a ordenação.');
        }

        // Estatísticas descritivas do histórico real.
        // Uma passagem pelos registros: O(n).
        let somaBPM = 0;
        let somaSpO2 = 0;
        let bpmMinimo = Infinity;
        let bpmMaximo = -Infinity;

        for (const registro of medicoes) {
            somaBPM += registro.bpm;
            somaSpO2 += registro.spo2;

            if (registro.bpm < bpmMinimo) bpmMinimo = registro.bpm;
            if (registro.bpm > bpmMaximo) bpmMaximo = registro.bpm;
        }

        const mediaBPM = somaBPM / medicoes.length;
        const mediaSpO2 = somaSpO2 / medicoes.length;

        const formato = new Intl.NumberFormat('pt-BR');

        const exemplos = ordenados.slice(0, 15).map(registro => `
            <tr>
                <td style="padding: 8px;">${registro.id}</td>
                <td style="padding: 8px;">${registro.bpm}</td>
                <td style="padding: 8px;">${registro.spo2}%</td>
            </tr>
        `).join('');

        saida.innerHTML = `
            <div style="padding: 1rem; border: 1px solid var(--card-border);
                        border-radius: 8px;">
                <p><strong>Origem:</strong> SQLite — ESP32-BANCADA-01</p>
                <p><strong>Medições encontradas:</strong>
                    ${formato.format(medicoes.length)}</p>
                <p><strong>Algoritmo:</strong> Merge Sort recursivo</p>
                <p><strong>Comparações:</strong>
                    ${formato.format(comparacoes)}</p>
                <p><strong>Tempo da ordenação:</strong>
                    ${tempo.toFixed(4)} ms</p>
                <p><strong>Complexidade:</strong> Θ(n log n)</p>

                <h4 style="color: var(--accent-blue); margin-top: 1rem;">
    Comparação com a ordenação do SQLite
</h4>

<p><strong>Merge Sort:</strong>
    ${tempo.toFixed(4)} ms de ordenação no navegador</p>

<p><strong>SQLite:</strong>
    ${resultadoSQLite.tempoConsultaMs.toFixed(4)} ms de consulta no servidor</p>

<p><strong>Registros comparados:</strong>
    ${medicoes.length}</p>

<p style="color: var(--accent-green);">
    Os dois métodos produziram a mesma sequência de registros.
</p>

<p style="color: var(--text-muted); margin-top: 0.5rem;">
    Os tempos representam operações diferentes:
    Merge Sort mede somente a ordenação;
    SQLite mede a consulta até o retorno ao servidor.
    Por isso, não são diretamente comparáveis como benchmark.
</p>

                <h4 style="color: var(--accent-blue); margin-top: 1rem;">
                    Comparação com Selection Sort
                </h4>

                <p><strong>Selection Sort:</strong>
                    ${formato.format(comparacoesSelection)} comparações
                    — ${tempoSelection.toFixed(4)} ms</p>

                <p><strong>Complexidade:</strong> Θ(n²)</p>

                <p><strong>Merge Sort:</strong>
                    ${formato.format(comparacoes)} comparações
                    — ${tempo.toFixed(4)} ms</p>

                    <h4 style="color: var(--accent-blue); margin-top: 1.5rem;">
    Estatísticas do histórico real
</h4>

<p><strong>BPM mínimo:</strong> ${bpmMinimo}</p>
<p><strong>BPM máximo:</strong> ${bpmMaximo}</p>
<p><strong>BPM médio:</strong> ${mediaBPM.toFixed(2)}</p>
<p><strong>SpO₂ médio:</strong> ${mediaSpO2.toFixed(2)}%</p>
<p><strong>Complexidade do cálculo:</strong> Θ(n)</p>

                <h4 style="color: var(--accent-blue); margin-top: 1rem;">
                    Primeiros 15 registros ordenados por BPM
                </h4>

                <div style="overflow-x: auto;">
                    <table style="width: 100%; text-align: left;">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>BPM</th>
                                <th>SpO₂</th>
                            </tr>
                        </thead>
                        <tbody>${exemplos}</tbody>
                    </table>
                </div>

                <p style="color: var(--accent-green); margin-top: 1rem;">
                    Ordenação crescente verificada com sucesso.
                </p>

                <p style="color: var(--text-muted); margin-top: 0.8rem;">
                    Análise realizada sobre registros históricos reais.
                    Os dados armazenados não foram modificados.
                    O tempo medido inclui somente a ordenação no navegador.
                </p>

                ${resultadoBusca}
            </div>
        `;
    } catch (erro) {
        saida.textContent = `Erro: ${erro.message}`;
    }
}
