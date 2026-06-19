#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    const Array_u8 data = tsc_fs_read_bytes_sync(STR_LIT("./data.bin"));
    printf("%zu\n", data.length);
    return 0;
}
