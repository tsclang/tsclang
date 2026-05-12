#include "runtime.h"

typedef struct { TscChannel_i32 *_inner; } Channel_i32;

int main(void) {
    TSC_INIT();
    Channel_i32 ch = { ._inner = tsc_channel_create_i32(5) };
    tsc_channel_send_i32(ch._inner, 1);
    tsc_channel_send_i32(ch._inner, 2);
    printf("%zu\n", tsc_channel_length_i32(ch._inner));
    printf("%zu\n", tsc_channel_capacity_i32(ch._inner));
    tsc_channel_release_i32(ch._inner);
    return 0;
}
