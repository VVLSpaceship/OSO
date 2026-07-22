export declare function searchOrgs(query: string): Promise<any[]>;
export declare function getAllOrgs(): Promise<any[]>;
export declare function searchPlayers(query: string): Promise<any[]>;
export declare function getAllPlayers(): Promise<any[]>;
export declare function getMemberByDiscordId(discordId: string): Promise<any | null>;
export declare function signMember(orgId: number, discordId: string, name: string, role?: string): Promise<{
    id: number;
}>;
export declare function releaseMember(discordId: string): Promise<{
    ok: boolean;
    removed: number;
}>;
export declare function createOrg(tag: string, name: string, region: string, logoUrl?: string): Promise<{
    id: number;
}>;
export declare function deleteOrg(tag: string): Promise<{
    ok: boolean;
}>;
export declare function setSigningOpen(tag: string, open: boolean): Promise<void>;
export declare function setOrgRole(tag: string, discordRoleId: string): Promise<void>;
//# sourceMappingURL=siteapi.d.ts.map