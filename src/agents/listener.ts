import { MoodReadResponse, PostReadResponse, UserReadPrivateResponse } from "@newstackdev/iosdk-newgraph-client-js";
import { newgraphWebsocketsClientManager } from "../clients/wsclient";
import { NewcoinWriterAgent } from ".";

export type NewcoinAgentHandlerResponse = string | { content: string, filesPaths: string[] };
export type NewcoinAgentHandler = (msg: string, agent: ReturnType<typeof NewcoinWriterAgent>) => NewcoinAgentHandlerResponse | Promise<NewcoinAgentHandlerResponse>;

export const NewcoinListener = async (token: string, listener?: NewcoinAgentHandler) => {
    // First verify authentication and get user info
    const writer = NewcoinWriterAgent(token);
    const user: {
        current: UserReadPrivateResponse
    } = { current: {} }

    try {
        // First authenticate and get user info
        const currentUser = await writer.current();
        user.current = currentUser;
        console.log("Successfully authenticated as:", currentUser.username);

        // Now establish WebSocket connection
        const newgraphWebsocketsClient = newgraphWebsocketsClientManager();
        
        // Initialize stats tracking
        const stats = {
            totalStringSize: 0,
            messagesCount: 0
        };

        // Set up event handlers
        newgraphWebsocketsClient.socket?.addEventListener("open", () => {
            console.log(`Connected and listening as ${user.current.username}`);
        });

        newgraphWebsocketsClient.socket?.addEventListener("message", async (msg) => {
            // Track message stats
            const msgSize = msg.data.toString().length;
            stats.totalStringSize += msgSize;
            stats.messagesCount += 1;

            // Handle pong messages
            if (msg.data == "pong") { 
                return Promise.resolve(); 
            }

            try {
                const data: { 
                    type: string, 
                    payload: { 
                        message: string, 
                        post: PostReadResponse, 
                        folder: MoodReadResponse 
                    } 
                } = JSON.parse(msg.data.toString());

                // Handle posts in folders
                if (data.type == "newgraph" && data?.payload?.message == "post_in_folder") {
                    const text = (data.payload?.post?.content || "").trim();

                    // Skip if not addressed to this agent
                    if (!text.startsWith(`/${user.current.username}`)) {
                        return Promise.resolve();
                    }

                    // Process with listener if provided
                    if (listener) {
                        try {
                            // Remove the username prefix from the message
                            const cleanedText = text.trim().replace(new RegExp(`/${user.current.username}`), "");
                            const _r = listener(cleanedText, writer);
                            const r = _r instanceof Promise ? await _r : _r;

                            if (typeof r == "string") {
                                // Simple text response
                                await writer.postMessage(data.payload.folder.id!, r);
                                console.log("Replied with text to:", data.payload.post.content, 'in folder', data.payload.folder.id!);
                            } else {
                                // Response with files
                                const filesPaths = r.filesPaths || [undefined];
                                for (let i = 0; i < filesPaths.length; i++) {
                                    const fp = filesPaths[i];
                                    console.log("Uploading file", fp);
                                    await writer.postMessage(data.payload.folder.id!, i ? "" : r.content, fp);
                                }
                            }
                        } catch (error) {
                            console.error("Error in listener handler:", error);
                        }
                    }
                }
            } catch (error) {
                console.error("Error processing message:", error);
            }
        });

        // Start the WebSocket connection
        newgraphWebsocketsClient.toggle(token);
        // Return client interface
        return {
            get stats() {
                return stats;
            },
            wsclient: newgraphWebsocketsClient
        };

    } catch (error) {
        console.error("Failed to initialize NewcoinListener:", error);
        throw error;
    }
}
