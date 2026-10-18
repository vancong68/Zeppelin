import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("counter_trigger_states")
export class CounterTriggerState {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column()
  trigger_id: number;

  @Column({ type: "bigint" })
  channel_id: string;

  @Column({ type: "bigint" })
  user_id: string;
}
