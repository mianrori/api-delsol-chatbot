import { getMemberRepository } from "../../repositories/members/member.repository.js";
import { getMemberPurchasesRepository } from "../../repositories/members/memberPurchase.repository.js";

export const getMember = async (args, connection) => {
  const member = await getMemberRepository(connection, args.documentNumber);

  if (!member) {
    return {
      status: "NOT_FOUND",
      documentNumber: args.documentNumber,
    };
  }

  return {
    status: "FOUND",
    member: {
      documentNumber: String(member.COD_SOCIO),
      firstName: member.NOMBRE,
      lastName: member.APELLIDO,
      fullName: member.NOMBRE_COMPLETO,
      registrationDate: member.FECHA_ALTA,
      birthDate: member.FECHA_NACIMIENTO,
      gender: member.GENERO,
      email: member.EMAIL,
      category: member.CATEGORIA,
      active: member.ACTIVO === "S",
      observation: member.OBSERVACION,
      receivesTelemarketing: member.RECIBE_TELEMARKETING === "S",
      generatesCoupon: member.GENERA_CUPON === "S",
      phone: member.TELEFONO,
    },
  };
};


export const getMemberPurchases = async (args, connection) => {
  return getMemberPurchasesRepository({
    connection,
    ...args,
  });
};
