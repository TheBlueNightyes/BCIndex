import { ActivityType } from 'discord.js'

export default async (client) => {
	client.user?.setActivity({
		name: 'Battle Cats!',
		type: ActivityType.Playing
	})
}
