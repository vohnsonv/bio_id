// database.js - Banco de Dados Provisório no Repositório
const INITIAL_USERS = [
  { id: "1", nome: "Vohnson Miranda", user: "881/1", pass: "6421", badge: "0004950667" },
  { id: "2", nome: "Maria Dorotéia", user: "881/2", pass: "6421", badge: "" },
  { id: "3", nome: "Vinícius", user: "881/3", pass: "536719", badge: "0004919162" },
  { id: "4", nome: "Maria das Graças", user: "881/4", pass: "1246", badge: "0005518104" },
  { id: "6", nome: "Ana Klara", user: "881/6", pass: "92881208", badge: "0005428213" },
  { id: "7", nome: "Vitória", user: "881/7", pass: "201608", badge: "0004851872" }
];

// Exporta para ser usado em outros scripts
if (typeof module !== 'undefined') {
    module.exports = INITIAL_USERS;
}
