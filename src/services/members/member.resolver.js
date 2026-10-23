import { searchMembersRepository } from "../../repositories/members/member.repository.js";

const mapMember = (member) => ({
  documentNumber: String(member.COD_SOCIO),
  fullName: member.NOMBRE_COMPLETO,
  category: member.CATEGORIA,
  active: member.ACTIVO === "S",
  similarity: Number(member.SIMILARITY ?? 0),
});

export const resolveMember = async (search, connection) => {
  const members = await searchMembersRepository(connection, search);

  if (!members || members.length === 0) {
    return {
      status: "NOT_FOUND",
      query: search,
      options: [],
    };
  }

  const first = members[0];

  if (first.MATCH_PRIORITY === 1) {
    return {
      status: "RESOLVED",
      member: mapMember(first),
    };
  }

  if (first.MATCH_PRIORITY === 2) {
    if (members.length === 1) {
      return {
        status: "RESOLVED",
        member: mapMember(first),
      };
    }

    const second = members[1];
    const scoreDifference =
      Number(first.SIMILARITY) - Number(second.SIMILARITY);

    if (Number(first.SIMILARITY) >= 95 && scoreDifference >= 5) {
      return {
        status: "RESOLVED",
        member: mapMember(first),
      };
    }
  }

  if (members.length === 1) {
    return {
      status: "RESOLVED",
      member: mapMember(first),
    };
  }

  const second = members[1];
  const scoreDifference =
    Number(first.SIMILARITY) - Number(second.SIMILARITY);

  if (Number(first.SIMILARITY) >= 90 && scoreDifference >= 10) {
    return {
      status: "RESOLVED",
      member: mapMember(first),
    };
  }

  return {
    status: "AMBIGUOUS",
    query: search,
    options: members.map((member, index) => ({
      optionId: String(index + 1),
      documentNumber: String(member.COD_SOCIO),
      fullName: member.NOMBRE_COMPLETO,
      category: member.CATEGORIA,
      active: member.ACTIVO === "S",
    })),
  };
};
