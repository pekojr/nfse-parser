import '../../config/config.js';

class NfseParser extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <input type="file" id="fileInput">
            <table id="table"></table>
            <button id="insertButton">Inserir</button>
        `;
        this.fileInput = this.shadowRoot.querySelector('#fileInput');
        this.table = this.shadowRoot.querySelector('#table');
        this.insertButton = this.shadowRoot.querySelector('#insertButton');
        this.fileInput.addEventListener('change', this.handleFileChange.bind(this));
        this.insertButton.addEventListener('click', this.handleInsertClick.bind(this));        
    }

    async handleFileChange(e) {
        const file = e.target.files[0];
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        
        const discriminacao = xmlDoc.getElementsByTagName('Discriminacao')[0].childNodes[0].nodeValue;
        const regex_bruto = /Valor Bruto:R\$ ([\d\.,]+)/;
        const match_bruto = discriminacao.match(regex_bruto);
        const regex_retencao = /Retencao indevida dos convenios ([\d\.,]+)/;
        const match_retencao = discriminacao.match(regex_retencao);
        const regex_desconto = /Contribuicao Socio:R\$ ([\d\.,]+)/;
        const match_desconto = discriminacao.match(regex_desconto);
        let valorBruto = match_bruto ? match_bruto[1] : xmlDoc.getElementsByTagName('ValoresNfse')[0].getElementsByTagName('BaseCalculo')[0].childNodes[0].nodeValue;
        let retencao = match_retencao ? match_retencao[1] : '0';
        let desconto = match_desconto ? match_desconto[1] : '0';
        valorBruto = Number(valorBruto.replace('.', '').replace(',', '.'));
        retencao = Number(retencao.replace('.', '').replace(',', '.'));
        desconto = Number(desconto.replace('.', '').replace(',', '.'));

        this.json = {
            InfNfse: {
                Numero: xmlDoc.getElementsByTagName('InfNfse')[0].getElementsByTagName('Numero')[0].childNodes[0].nodeValue,
                DataEmissao: xmlDoc.getElementsByTagName('InfNfse')[0].getElementsByTagName('DataEmissao')[0].childNodes[0].nodeValue,
                ValoresNfse: {
                    BaseCalculo: xmlDoc.getElementsByTagName('ValoresNfse')[0].getElementsByTagName('BaseCalculo')[0].childNodes[0].nodeValue,
                    ValorIss: xmlDoc.getElementsByTagName('ValoresNfse')[0].getElementsByTagName('ValorIss')[0].childNodes[0].nodeValue,
                    ValorLiquidoNfse: xmlDoc.getElementsByTagName('ValoresNfse')[0].getElementsByTagName('ValorLiquidoNfse')[0].childNodes[0].nodeValue,
                },
                IdentificacaoTomador: {
                    CPF: xmlDoc.getElementsByTagName('IdentificacaoTomador')[0].getElementsByTagName('Cpf')[0]?.childNodes[0].nodeValue,
                    CNPJ: xmlDoc.getElementsByTagName('IdentificacaoTomador')[0].getElementsByTagName('Cnpj')[0]?.childNodes[0].nodeValue,
                    RazaoSocial: xmlDoc.getElementsByTagName('TomadorServico')[0].getElementsByTagName('RazaoSocial')[0]?.childNodes[0].nodeValue,                    
                },
                Pis: xmlDoc.getElementsByTagName('ValorPis')[0]?.childNodes[0].nodeValue,
                Cofins: xmlDoc.getElementsByTagName('ValorCofins')[0]?.childNodes[0].nodeValue,
                Inss: xmlDoc.getElementsByTagName('ValorInss')[0]?.childNodes[0].nodeValue,
                Ir: xmlDoc.getElementsByTagName('ValorIr')[0]?.childNodes[0].nodeValue,
                Csll: xmlDoc.getElementsByTagName('ValorCsll')[0]?.childNodes[0].nodeValue,
                valorBruto: valorBruto,
                retencao: retencao,
                desconto: desconto,
                Discriminacao: xmlDoc.getElementsByTagName('Discriminacao')[0].childNodes[0].nodeValue
            },
        };

        this.table.innerHTML = '';
        for (const key in this.json.InfNfse) {
            const value = this.json.InfNfse[key];
            if (typeof value === 'object') {
                for (const subKey in value) {
                    const subValue = value[subKey];
                    this.addRow(`${key}.${subKey}`, subValue);
                }
            } else {
                this.addRow(key, value);
            }
        }
    }

    addRow(key, value) {
        const row = document.createElement('tr');
        const keyCell = document.createElement('td');
        const valueCell = document.createElement('td');
        keyCell.textContent = key;
        const valor = document.createElement('input');
        valor.type = "text";
        valor.value = value;
        valor.addEventListener('input', (e) => {
            const keys = key.split('.');
            if (keys.length === 2) {
                this.json.InfNfse[keys[0]][keys[1]] = e.target.value;
            } else {
                this.json.InfNfse[key] = e.target.value;
            }
        });
        valueCell.appendChild(valor);
        row.appendChild(keyCell);
        row.appendChild(valueCell);
        this.table.appendChild(row);
    }
    formatter(json) {
        let newCnpjCpf = "PessoaFisica";
        const oldCnpjCpf = json.InfNfse.IdentificacaoTomador.CNPJ;
        newCnpjCpf = cnpjCpfMap[oldCnpjCpf] || newCnpjCpf;

        return {
            nNF: 1000+ Number(json.InfNfse.Numero),
            repasse: json.InfNfse.DataEmissao,
            vPag: json.InfNfse.ValoresNfse.BaseCalculo,
            vISSRet: json.InfNfse.ValoresNfse.ValorIss,
            dest: newCnpjCpf,
            vRetPIS: json.InfNfse.Pis,
            vRetCOFINS: json.InfNfse.Cofins,
            inss: json.InfNfse.Inss,
            vIRRFRet: json.InfNfse.Ir,
            vRetCSLL: json.InfNfse.Csll,
            desconto: json.InfNfse.desconto,
            retencao: json.InfNfse.retencao,
            bruto: json.InfNfse.valorBruto
        }
    }
    showToast(message) {
        const toast = document.createElement('toast-notification');
        toast.textContent = message;
        document.body.appendChild(toast);
    }

    async handleInsertClick() {
        console.log(this.formatter(this.json));
        try{
            const token = urlParams.get('access_token');
            const response = await fetch(urlAPI, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(this.formatter(this.json))
            });
            const result = await response.json();
            console.log(result);
            this.showToast('Nfse inserida com sucesso!');
        } catch (error) {
            console.error('Error:', error);
            this.showToast(errorMessage);
        }        
    }    
}
export default NfseParser;