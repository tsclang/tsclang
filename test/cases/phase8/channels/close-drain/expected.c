#include "runtime.h"

typedef struct { TscChannel_i32 *_inner; } Channel_i32;

int main(void) {
    TSC_INIT();
    Channel_i32 ch = { ._inner = tsc_channel_create_i32(3) };
    tsc_channel_send_i32(ch._inner, 1);
    tsc_channel_send_i32(ch._inner, 2);
    tsc_channel_close_i32(ch._inner);
    while (!tsc_channel_is_empty_i32(ch._inner)) {
        printf("%d\n", tsc_channel_receive_i32(ch._inner));
    }
    tsc_channel_release_i32(ch._inner);
    return 0;
}
