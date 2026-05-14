#include "runtime.h"
#include "std/fs.h"

int main(void) {
    TSC_INIT();
    const String content = tsc_fs_read_sync(STR_LIT("./data.txt"));
    printf("%s\n", content.data);
    tsc_string_release(content);
    return 0;
}
