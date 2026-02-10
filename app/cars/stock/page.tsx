import { redirect } from 'next/navigation'

export default function CarsStockPage() {
  redirect('/cars?tab=cars')
}
