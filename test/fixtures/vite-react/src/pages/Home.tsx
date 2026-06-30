import { getOrders } from "../api/client"

export default function Home() {
  getOrders()
  return null
}
