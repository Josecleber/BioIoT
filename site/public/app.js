
let pacienteAtivo = {
    id: null,
    nome: "Nenhum",
    idade: "",
    dispositivo: "ESP32-BANCADA-01"
};

let realtimeChart = null;
let performanceChart = null;
let ultimoIdPlotado = null;
let graficoEmPausa = false;

function marcarInterrupcaoGrafico() {
    if (!realtimeChart || graficoEmPausa) return;

    if (realtimeChart.data.labels.length === 0) return;

    realtimeChart.data.labels.push(
        new Date().toLocaleTimeString('pt-BR')
    );

    realtimeChart.data.datasets.forEach(dataset => {
        dataset.data.push(null);
    });

    while (realtimeChart.data.labels.length > 10) {
        realtimeChart.data.labels.shift();
        realtimeChart.data.datasets.forEach(dataset => {
            dataset.data.shift();
        });
    }

    graficoEmPausa = true;
    realtimeChart.update();
}

function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    element.classList.add('active');
}

async function verificarStatusConexaoESP() {
    try {
        const resposta = await fetch('/api/status-esp');
        const dados = await resposta.json();

        const elementoCondicao = document.getElementById('condicaoGeralTexto');
        const elementoDispositivo = document.getElementById('activeDevice');

        if (!dados.online) {
            if (elementoCondicao) {
                elementoCondicao.textContent = "SEM SINAL";
                elementoCondicao.style.color = "var(--accent-yellow)";
            }
            if (elementoDispositivo) {
                elementoDispositivo.textContent = `${pacienteAtivo.dispositivo} (Sem Sinal)`;
                elementoDispositivo.style.color = "var(--accent-red)";
            }
        } else {
            if (elementoDispositivo) {
                elementoDispositivo.textContent = pacienteAtivo.dispositivo;
                elementoDispositivo.style.color = "var(--text-main)";
            }
        }
    } catch (erro) {
        console.error("Erro ao verificar status da ESP32:", erro);
    }
}

async function carregarPacientes() {
    try {
        const res = await fetch('/api/pacientes');
        const pacientes = await res.json();

        const tbody = document.getElementById('patientsTableBody');
        tbody.innerHTML = '';

        if (pacientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="padding: 15px; text-align: center; color: var(--text-muted);">Nenhum paciente cadastrado.</td></tr>`;
            return;
        }

        if (!pacienteAtivo.id && pacientes.length > 0) {
            selecionarPacienteParaMonitorar(pacientes[0].id, pacientes[0].nome, pacientes[0].idade, pacientes[0].dispositivo);
        }

        pacientes.forEach(p => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--card-border)';
            tr.innerHTML = `
                <td style="padding: 10px;">${p.nome}</td>
                <td style="padding: 10px;">${p.idade}</td>
                <td style="padding: 10px;">${p.dispositivo}</td>
                <td style="padding: 10px; text-align: right;">
                    <button onclick="selecionarPacienteParaMonitorar(${p.id}, '${p.nome}', ${p.idade}, '${p.dispositivo}')" style="background: var(--accent-blue); color: #fff; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer; margin-right: 5px;">Monitorar</button>
                    <button onclick="excluirPaciente(${p.id})" style="background: var(--accent-red); color: #fff; border: none; padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer;">Excluir</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Erro ao carregar pacientes:", err);
    }
}

async function cadastrarPaciente(e) {
    e.preventDefault();
    const nome = document.getElementById('pNome').value;
    const idade = document.getElementById('pIdade').value;
    const dispositivo = document.getElementById('pDispositivo').value;

    try {
        const res = await fetch('/api/pacientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, idade, dispositivo })
        });

        if (res.ok) {
            document.getElementById('patientForm').reset();
            document.getElementById('pDispositivo').value = 'ESP32-BANCADA-01';
            carregarPacientes();
        }
    } catch (err) {
        console.error("Erro ao cadastrar paciente:", err);
    }
}

async function excluirPaciente(id) {
    if (!confirm("Tem certeza que deseja excluir este paciente?")) return;
    try {
        await fetch(`/api/pacientes/${id}`, { method: 'DELETE' });
        carregarPacientes();
    } catch (err) {
        console.error("Erro ao excluir paciente:", err);
    }
}

function selecionarPacienteParaMonitorar(id, nome, idade, dispositivo) {
    pacienteAtivo = { id, nome, idade, dispositivo };

    ultimoIdPlotado = null;
    graficoEmPausa = false;

    if (realtimeChart) {
        realtimeChart.data.labels = [];
        realtimeChart.data.datasets.forEach(dataset => {
            dataset.data = [];
        });
        realtimeChart.update();
    }

    const elemNome = document.getElementById('activePatientName');
    const elemInfo = document.getElementById('activePatientInfo');
    if (elemNome) elemNome.textContent = nome;
    if (elemInfo) elemInfo.textContent = `(${idade} anos)`;

    const elemDevice = document.getElementById('activeDevice');
    if (elemDevice) elemDevice.textContent = dispositivo;

    atualizarDadosDashboard();
}

async function atualizarDadosDashboard() {
    if (!pacienteAtivo.dispositivo) return;

    try {
        const res = await fetch(`/api/dados/ultimo/${pacienteAtivo.dispositivo}`);
        const dados = await res.json();

        const respostaStatus = await fetch('/api/status-esp');
        const statusESP = await respostaStatus.json();

        if (!statusESP.online) {
            marcarInterrupcaoGrafico();

            document.getElementById('bpmValue').textContent = '--';
            document.getElementById('spo2Value').textContent = '--';

            document.getElementById('bpmStatus').textContent = 'Sem sinal';
            document.getElementById('spo2Status').textContent = 'Sem sinal';

            document.getElementById('bpmStatus').classList.remove('status-normal');
            document.getElementById('spo2Status').classList.remove('status-normal');

        const condicao = document.getElementById('condicaoGeralTexto');

        if (condicao) {
            condicao.textContent = 'SEM SINAL';
            condicao.style.color = 'var(--accent-yellow)';
        }

        return;
    }
        const bpm = dados.bpm || 0;
        const spo2 = dados.spo2 || 0;
        
        
        const bpmStatus = document.getElementById('bpmStatus');
        const spo2Status = document.getElementById('spo2Status');

        function atualizarIndicadores(textoBpm, textoSpo2, valido) {
            if (bpmStatus) {
                bpmStatus.textContent = textoBpm;
                bpmStatus.classList.toggle('status-normal', valido);
            }

            if (spo2Status) {
                spo2Status.textContent = textoSpo2;
                spo2Status.classList.toggle('status-normal', valido);
            }
        }

        if (bpm === 0 || spo2 === 0) {
            marcarInterrupcaoGrafico();
            atualizarIndicadores('Sem medição', 'Sem medição', false);
            document.getElementById('bpmValue').textContent = '--';
            document.getElementById('spo2Value').textContent = '--';

            const elementoCondicao = document.getElementById('condicaoGeralTexto');

        if (elementoCondicao) {
            elementoCondicao.textContent = "SEM MEDIÇÃO";
            elementoCondicao.style.color = "var(--accent-yellow)";
        }

        return;
        }

        if (bpm === -1 || spo2 === -1) {
            marcarInterrupcaoGrafico();
            atualizarIndicadores('Calculando...', 'Calculando...', false);
            document.getElementById('bpmValue').innerHTML = '<span style="font-size: 0.5em; color: var(--accent-blue);">Lendo...</span>';
            document.getElementById('spo2Value').innerHTML = '<span style="font-size: 0.5em; color: var(--accent-blue);">Lendo...</span>';
            
            // Muda o texto do status geral
            const elementoCondicao = document.getElementById('condicaoGeralTexto');
            if (elementoCondicao) {
                elementoCondicao.textContent = "A CALCULAR...";
                elementoCondicao.style.color = "var(--accent-blue)";
            }
            return; // Interrompe aqui para não desenhar o "-1" no gráfico
        }

        document.getElementById('bpmValue').textContent = bpm;
        document.getElementById('spo2Value').textContent = spo2;

        atualizarIndicadores('Leitura disponível', 'Leitura disponível', true);

        const elementoCondicao = document.getElementById('condicaoGeralTexto');

        if (elementoCondicao) {
            elementoCondicao.textContent = "LEITURA DISPONÍVEL";
            elementoCondicao.style.color = "var(--accent-green)";
        }

        if (dados.id == null || dados.id === ultimoIdPlotado) {
            return;
        }

        ultimoIdPlotado = dados.id;
        graficoEmPausa = false;

        const agora = new Date().toLocaleTimeString('pt-BR');

        if (realtimeChart) {
            if (realtimeChart.data.labels.length >= 10) {
                realtimeChart.data.labels.shift();
                realtimeChart.data.datasets[0].data.shift();
                realtimeChart.data.datasets[1].data.shift();
            }

            realtimeChart.data.labels.push(agora);
            realtimeChart.data.datasets[0].data.push(bpm);
            realtimeChart.data.datasets[1].data.push(spo2);
            realtimeChart.update();
        }

        if (performanceChart) {
            const cpuSimulado = (12 + Math.random() * 4).toFixed(1);
            document.getElementById('cpuUsage').textContent = cpuSimulado;

            if (performanceChart.data.labels.length > 10) {
                performanceChart.data.labels.shift();
                performanceChart.data.datasets[0].data.shift();
            }

            performanceChart.data.labels.push(agora);
            performanceChart.data.datasets[0].data.push(cpuSimulado);
            performanceChart.update();
        }

    } catch (err) {
        console.error("Erro ao buscar dados do dashboard:", err);
    }
}

function inicializarGraficoSaude() {
    const ctx = document.getElementById('realtimeChart');
    if (!ctx) return;

    realtimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'BPM (Batimentos)',
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    data: [],
                    tension: 0.3,
                    spanGaps: false,
                    fill: false
                },
                {
                    label: 'SpO₂ (%)',
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    data: [],
                    tension: 0.3,
                    spanGaps: false,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#334155' } },
                x: { grid: { color: '#334155' } }
            }
        }
    });
}

function inicializarGraficoPerformance() {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;

    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'CPU (%)',
                    borderColor: '#eab308',
                    backgroundColor: 'rgba(234, 179, 8, 0.1)',
                    data: [],
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#334155' } },
                x: { grid: { color: '#334155' } }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    inicializarGraficoSaude();
    inicializarGraficoPerformance();
    carregarPacientes();

    setInterval(verificarStatusConexaoESP, 3000);
    setInterval(atualizarDadosDashboard, 2000);
});
async function exportarRelatorioCSV() {
    try {
        const tipo = document.getElementById('tipoRelatorio').value;
        let url = '/api/relatorios/geral';

        if (tipo === 'individual' && pacienteAtivo.dispositivo) {
            url = `/api/relatorios/individual/${pacienteAtivo.dispositivo}`;
        }

        const res = await fetch(url);
        const dados = await res.json();

        if (!dados || dados.length === 0) {
            alert("Não existem dados disponíveis para exportar neste relatório.");
            return;
        }

  
        let csvContent = "data:text/csv;charset=utf-8,ID,Dispositivo,BPM,SpO2,DataHora\n";

        dados.forEach(row => {
            csvContent += `${row.id},${row.dispositivo},${row.bpm},${row.spo2},${row.timestamp}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `relatorio_bioiot_${tipo}.csv`);
        document.body.appendChild(link);
        
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Erro ao exportar CSV:", err);
        alert("Erro ao gerar o relatório CSV.");
    }
}