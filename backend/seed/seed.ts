/* eslint-disable no-console */
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { User } from '../src/models/User';
import { Bottle } from '../src/models/Bottle';
import { Reservation } from '../src/models/Reservation';

const SAMPLE_BOTTLES = [
  {
    labelName: 'Château Margaux',
    producer: 'Château Margaux',
    vintage: 2015,
    region: 'Bordeaux',
    varietal: 'Cabernet Sauvignon Blend',
    photoUrl: 'https://example.com/photos/margaux-2015.jpg',
    retailValueCents: 95000_00,
    pricePerNightCents: 150_00,
    depositCents: 95000_00
  },
  {
    labelName: 'Domaine de la Romanée-Conti',
    producer: 'DRC',
    vintage: 2018,
    region: 'Burgundy',
    varietal: 'Pinot Noir',
    photoUrl: 'https://example.com/photos/drc-2018.jpg',
    retailValueCents: 250000_00,
    pricePerNightCents: 400_00,
    depositCents: 250000_00
  },
  {
    labelName: 'Opus One',
    producer: 'Opus One Winery',
    vintage: 2017,
    region: 'Napa Valley',
    varietal: 'Bordeaux Blend',
    photoUrl: 'https://example.com/photos/opus-2017.jpg',
    retailValueCents: 45000_00,
    pricePerNightCents: 75_00,
    depositCents: 45000_00
  },
  {
    labelName: 'Sassicaia',
    producer: 'Tenuta San Guido',
    vintage: 2016,
    region: 'Tuscany',
    varietal: 'Cabernet Sauvignon',
    photoUrl: 'https://example.com/photos/sassicaia-2016.jpg',
    retailValueCents: 30000_00,
    pricePerNightCents: 50_00,
    depositCents: 30000_00
  },
  {
    labelName: 'Penfolds Grange',
    producer: 'Penfolds',
    vintage: 2014,
    region: 'South Australia',
    varietal: 'Shiraz',
    photoUrl: 'https://example.com/photos/grange-2014.jpg',
    retailValueCents: 80000_00,
    pricePerNightCents: 125_00,
    depositCents: 80000_00
  },
  {
    labelName: 'Krug Grande Cuvée',
    producer: 'Krug',
    vintage: 2008,
    region: 'Champagne',
    varietal: 'Champagne Blend',
    photoUrl: 'https://example.com/photos/krug-2008.jpg',
    retailValueCents: 40000_00,
    pricePerNightCents: 70_00,
    depositCents: 40000_00
  }
];

async function seed(): Promise<void> {
  await connectDatabase();
  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Bottle.deleteMany({}),
    Reservation.deleteMany({})
  ]);

  console.log('Creating users...');
  const customerHash = await bcrypt.hash('Customer1!', 10);
  const conciergeHash = await bcrypt.hash('Concierge1!', 10);
  await User.create([
    {
      email: 'customer@example.com',
      passwordHash: customerHash,
      role: 'customer',
      shippingAddress: '123 Vine Street, Napa, CA 94558'
    },
    {
      email: 'concierge@example.com',
      passwordHash: conciergeHash,
      role: 'concierge'
    }
  ]);

  console.log('Creating bottles...');
  await Bottle.insertMany(SAMPLE_BOTTLES);

  console.log('Seed complete.');
  console.log('---');
  console.log('Test credentials:');
  console.log('  Customer:  customer@example.com / Customer1!');
  console.log('  Concierge: concierge@example.com / Concierge1!');
  console.log('---');

  await disconnectDatabase();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
