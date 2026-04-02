#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("a,b,c");
    String *parts;
    int32_t parts_len;
    tsc_string_split(s, STR_LIT(","), &parts, &parts_len);
    printf("%s\n", parts[0].data);
    printf("%s\n", parts[1].data);
    printf("%s\n", parts[2].data);
    tsc_string_array_free(parts, parts_len);
    return 0;
}
