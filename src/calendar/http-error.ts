/** Shared by the Next.js app and the standalone Calendar worker. */
export class CalendarHttpError extends Error {
  readonly status:number;
  constructor(status:number,message:string){super(message);this.name='CalendarHttpError';this.status=status;}
}
