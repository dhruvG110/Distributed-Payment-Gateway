import {Redis} from "@upstash/redis"
import "dotenv/config"
const redis =  Redis.fromEnv();
export default redis;