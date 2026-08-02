const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const client = TableClient.fromConnectionString(connectionString, 'bookings');

app.http('getBookings', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const bookings = [];
            const entities = client.listEntities();
            for await (const entity of entities) {
                bookings.push(entity);
            }
            return { body: JSON.stringify(bookings) };
        } catch (error) {
            return { status: 500, body: JSON.stringify({ error: error.message }) };
        }
    }
});
